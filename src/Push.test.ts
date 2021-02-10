import fs from 'fs'
import fetchMock from 'fetch-mock'

import Push from './Push'
import { Config } from './types'

jest.mock('fs')

const readFileSync = fs.readFileSync as jest.Mock

const createConfig = (locales: string[], namespaces: string[]): Config => {
  const sources = []

  locales.forEach(localeId => {
    namespaces.forEach(namespace => {
      sources.push({
        file: `locales/${localeId}/${namespace}.json`,
        params: {
          locale_id: localeId,
          file_format: 'i18next',
          tags: namespace
        }
      })
    })
  })
  return {
    phrase: {
      access_token: 'TOKEN',
      project_id: 'PROJECT_ID',
      push: {
        sources
      }
    }
  }
}

afterEach(() => {
  readFileSync.mockClear()
  fetchMock.restore()
})

describe('Push', () => {
  it('should load local resources', () => {
    const files = {
      'locales/en/web.json': JSON.stringify({ key: 'hello' }),
      'locales/en/mail.json': JSON.stringify({ foo: 'user' }),
      'locales/cs/web.json': JSON.stringify({ key: 'ahoj' }),
      'locales/cs/mail.json': JSON.stringify({ foo: 'uživatel' })
    }
    readFileSync.mockImplementation(file => {
      if (!files[file]) {
        throw new Error(`File ${file} not found`)
      }

      return files[file]
    })

    const push = new Push(createConfig(['en', 'cs'], ['web', 'mail']))
    push.readLocalResources()

    expect(push.localResources).toEqual({
      en: {
        web: { key: 'hello' },
        mail: { foo: 'user' }
      },
      cs: {
        web: { key: 'ahoj' },
        mail: { foo: 'uživatel' }
      }
    })
  })

  it('should load remote resources', async () => {
    fetchMock.getOnce(
      'https://api.phrase.com/v2/projects/PROJECT_ID/locales/en/download?file_format=i18next&tags=web',
      {
        body: { key: 'hello' }
      }
    )
    fetchMock.getOnce(
      'https://api.phrase.com/v2/projects/PROJECT_ID/locales/en/download?file_format=i18next&tags=mail',
      {
        body: { foo: 'user' }
      }
    )
    fetchMock.getOnce(
      'https://api.phrase.com/v2/projects/PROJECT_ID/locales/cs/download?file_format=i18next&tags=web',
      {
        body: { key: 'ahoj' }
      }
    )
    fetchMock.getOnce(
      'https://api.phrase.com/v2/projects/PROJECT_ID/locales/cs/download?file_format=i18next&tags=mail',
      {
        body: { foo: 'uživatel' }
      }
    )
    const push = new Push(createConfig(['en', 'cs'], ['web', 'mail']))
    await push.readRemoteResources()

    expect(push.remoteResources).toEqual({
      en: {
        web: { key: 'hello' },
        mail: { foo: 'user' }
      },
      cs: {
        web: { key: 'ahoj' },
        mail: { foo: 'uživatel' }
      }
    })
  })

  it('should find string keys unmentioned on remote', () => {
    const push = new Push(createConfig(['en', 'cs'], ['web', 'mail']))
    push.localResources = {
      en: {
        web: {
          key: 'hello',
          home: {
            details: {
              calls: '{{ count }} call',
              calls_plural: '{{ count }} calls'
            }
          }
        },
        mail: {
          /* `foo` missing */
        }
      },
      cs: {
        web: {
          key: 'ahoj'
          /* `home.details.calls_0` missing */
          /* `home.details.calls_1` missing */
          /* `home.details.calls_2` missing */
        },
        mail: {
          /* `foo` missing */
        }
      }
    }
    push.remoteResources = {
      en: {
        web: {
          key: 'hello',
          home: {
            details: {
              calls: '{{ count }} call',
              calls_plural: '{{ count }} calls'
            }
          }
        },
        mail: { foo: 'user' }
      },
      cs: {
        web: {
          key: 'ahoj',
          home: {
            details: {
              calls_0: '{{ count }} hovor',
              calls_1: '{{ count }} hovory',
              calls_2: '{{ count }} hovorů'
            }
          }
        },
        mail: { foo: 'uživatel' }
      }
    }

    expect(push.getRemoteUnmentionedKeys()).toEqual({
      web: [
        ['home', 'details', 'calls_0'],
        ['home', 'details', 'calls_1'],
        ['home', 'details', 'calls_2']
      ],
      mail: [['foo']]
    })
  })

  it('should find array keys unmentioned on remote', () => {
    const push = new Push(createConfig(['en', 'cs'], ['web']))
    push.localResources = {
      en: {
        web: {
          /* `list.items` array missing */
        }
      },
      cs: {
        web: {}
      }
    }
    push.remoteResources = {
      en: {
        web: {
          list: {
            items: [
              {
                imageAlt: 'Nice image',
                info: 'Lorem ipsum here',
                title: 'Some cool title'
              }
            ]
          }
        }
      },
      cs: {
        web: {}
      }
    }
    expect(push.getRemoteUnmentionedKeys()).toEqual({
      web: [['list', 'items']]
    })
  })

  it('deletes given keys in remote resources', async () => {
    fetchMock.once(
      {
        url: 'https://api.phrase.com/v2/projects/PROJECT_ID/keys',
        method: 'DELETE',
        query: { q: 'name:home.details.calls_0,home.details.calls_1,home.details.calls_2,list.items tags:web' }
      },
      {
        body: { records_affected: 4 }
      },
      {
        name: 'delete - iteration 1'
      }
    )
    fetchMock.once(
      {
        url: 'https://api.phrase.com/v2/projects/PROJECT_ID/keys',
        method: 'DELETE',
        query: { q: 'name:foo tags:mail' }
      },
      {
        body: { records_affected: 1 }
      },
      {
        name: 'delete - iteration 2'
      }
    )

    const push = new Push(createConfig(['en', 'cs'], ['web', 'mail']))
    const deletedKeysCount = await push.deleteRemoteKeys({
      web: [
        ['home', 'details', 'calls_0'],
        ['home', 'details', 'calls_1'],
        ['home', 'details', 'calls_2'],
        ['list', 'items']
      ],
      mail: [['foo']]
    })
    expect(deletedKeysCount).toBe(5)
  })
})
