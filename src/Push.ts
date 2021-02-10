import differenceWith from 'lodash/differenceWith'
import fs from 'fs'
import get from 'lodash/get'
import isEqual from 'lodash/isEqual'
import chunk from 'lodash/chunk'
import mapValues from 'lodash/mapValues'
import uniqBy from 'lodash/uniqBy'
import { Configuration, KeysApi, LocalesApi } from 'phrase-js'

import './setup'
import flattenObjectKeys from './utils/flattenObjectKeys'
import { Config } from './types'

type KeysByNamespaceDictionary = {
  [namespace: string]: string[][]
}

type Source = {
  file: string
  params: {
    locale_id: string
    file_format: string
    tags: string
  }
}

type SourcesDictionary = {
  [lng: string]: {
    [namespace: string]: Source
  }
}

type Resource = Object

type ResourcesDictionary = {
  [lng: string]: {
    [namespace: string]: Resource
  }
}

class Push {
  config: Config

  localResources: ResourcesDictionary = {}

  remoteResources: ResourcesDictionary = {}

  sources: SourcesDictionary = {}

  protected keysApi: KeysApi

  protected localesApi: LocalesApi

  constructor(config: Config) {
    this.config = config
    this.validateConfig()

    const phraseConfiguration = new Configuration({
      apiKey: `Bearer ${config.phrase.access_token}`,
      fetchApi: fetch
    })
    this.keysApi = new KeysApi(phraseConfiguration)
    this.localesApi = new LocalesApi(phraseConfiguration)
  }

  async deleteRemoteKeys(keysByNamespace: KeysByNamespaceDictionary): Promise<number> {
    let deletedKeysCount = 0

    for (const namespace of Object.keys(keysByNamespace)) {
      const namespaceKeys = keysByNamespace[namespace]

      if (namespaceKeys.length <= 0) {
        continue
      }

      // Chunks keys to smaller groups so we delete them using multiple API requests
      // Deleting all keys in 1 request would fail
      const chunkedNamespaceKeys = chunk(namespaceKeys, 50)
      for (const keys of chunkedNamespaceKeys) {
        // tslint:disable-next-line:no-commented-out-code
        // [['key1', 'foo'], ['key2', 'bar', 'baz']] --> ['key1.foo', 'key2.bar.baz']
        const keyNames = keys.map(keyPath => keyPath.join('.'))
        // tslint:disable-next-line:no-commented-out-code
        // ['key1.foo', 'key2.bar.baz'] --> 'key1.foo,key2.bar.baz'
        // See https://developers.phrase.com/api/#delete-/projects/{project_id}/keys
        const { recordsAffected } = await this.keysApi.keysDelete({
          projectId: this.config.phrase.project_id,
          q: `name:${keyNames.join(',')} tags:${namespace}`
        })
        deletedKeysCount += recordsAffected
        keys.forEach(keyPath => {
          console.log(`Deleted key "${namespace}:${keyPath.join('.')}"`)
        })
      }
    }

    console.log(`\n${deletedKeysCount} keys deleted in remote resources`)

    return deletedKeysCount
  }

  /**
   * Finds keys in remote resources that are unmentioned in local resources
   */
  getRemoteUnmentionedKeys(): KeysByNamespaceDictionary {
    let localKeysByNamespace: KeysByNamespaceDictionary = {}
    let remoteKeysByNamespace: KeysByNamespaceDictionary = {}
    const unmentionedKeysByNamespace: KeysByNamespaceDictionary = {}
    let unmentionedKeysCount = 0

    // Gather local & remote keys for all namespaces
    for (const lng of Object.keys(this.sources)) {
      this.remoteResources[lng] = this.remoteResources[lng] || {}

      for (const namespace of Object.keys(this.sources[lng])) {
        // We do not traverse array keys as Phrase considers
        const localResourcesKeys = flattenObjectKeys(this.localResources[lng][namespace], { traverseArrays: false })
        const remoteResourcesKeys = flattenObjectKeys(this.remoteResources[lng][namespace], { traverseArrays: false })

        localKeysByNamespace[namespace] = (localKeysByNamespace[namespace] || []).concat(localResourcesKeys)
        remoteKeysByNamespace[namespace] = (remoteKeysByNamespace[namespace] || []).concat(remoteResourcesKeys)
      }
    }

    localKeysByNamespace = mapValues(localKeysByNamespace, keys => uniqBy(keys, key => key.join('.')))
    remoteKeysByNamespace = mapValues(remoteKeysByNamespace, keys => uniqBy(keys, key => key.join('.')))

    // Diff remote vs. local keys by namespaces
    for (const namespace of Object.keys(localKeysByNamespace)) {
      const unmentionedKeys = differenceWith(remoteKeysByNamespace[namespace], localKeysByNamespace[namespace], isEqual)
      unmentionedKeysByNamespace[namespace] = unmentionedKeys
      unmentionedKeysCount += unmentionedKeys.length
    }

    return unmentionedKeysByNamespace
  }

  /**
   * Finds unmentioned keys in remote resources and deletes them
   * so remote contains no extra keys
   */
  async pruneRemoteResources(dryRun = true): Promise<number> {
    const remoteUnmentionedKeys = this.getRemoteUnmentionedKeys()

    if (!dryRun) {
      return this.deleteRemoteKeys(remoteUnmentionedKeys)
    }

    let remoteUnmentionedKeysCount = 0
    for (const namespace of Object.keys(remoteUnmentionedKeys)) {
      remoteUnmentionedKeys[namespace].forEach(keyPath => {
        console.log(`Unmentioned key found "${namespace}:${keyPath.join('.')}"`)
      })
      remoteUnmentionedKeysCount += remoteUnmentionedKeys[namespace].length
    }

    console.log(
      `\n${remoteUnmentionedKeysCount} unmentioned keys found in remote resources.\nPass --dry-run false to apply changes.`
    )
    return 0 // Nothing deleted in dry run
  }

  async readResources() {
    this.readLocalResources()
    await this.readRemoteResources()
  }

  readLocalResources() {
    this.localResources = {}

    Object.keys(this.sources).forEach(lng => {
      this.localResources[lng] = this.localResources[lng] || {}

      Object.keys(this.sources[lng]).forEach(namespace => {
        const source = this.sources[lng][namespace]

        this.localResources[lng][namespace] = JSON.parse(fs.readFileSync(source.file, 'utf-8'))
        console.log(`Local resource loaded ${source.file}`)
      })
    })
  }

  async readRemoteResources() {
    this.remoteResources = {}

    for (const lng of Object.keys(this.sources)) {
      this.remoteResources[lng] = this.remoteResources[lng] || {}

      for (const namespace of Object.keys(this.sources[lng])) {
        const source = this.sources[lng][namespace]

        this.remoteResources[lng][namespace] = JSON.parse(
          await this.localesApi.localeDownload({
            id: source.params.locale_id,
            fileFormat: source.params.file_format,
            projectId: this.config.phrase.project_id,
            tags: source.params.tags
          })
        )

        console.log(`Remote resource loaded (locale_id: ${source.params.locale_id}, tags: ${source.params.tags})`)
      }
    }
  }

  validateConfig() {
    const projectId = get(this.config, 'phrase.project_id')
    const accessToken = get(this.config, 'phrase.access_token')

    if (typeof projectId !== 'string' || !projectId) {
      throw new Error('Please provide `project_id` in Phrase config')
    }

    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('Please provide `access_token` in Phrase config')
    }

    const sources = get(this.config, 'phrase.push.sources')

    if (!Array.isArray(sources)) {
      throw new Error('Please provide `push.sources` in Phrase config')
    }

    sources.forEach(source => {
      if (typeof source.file !== 'string') {
        throw new Error(
          `Push source file not defined (locale_id: ${source.params.locale_id}, tags: ${source.params.tags})`
        )
      }

      if (typeof source.params.locale_id !== 'string') {
        throw new Error(`Push source locale_id not defined (file: ${source.file}, tags: ${source.params.tags})`)
      }

      if (typeof source.params.tags !== 'string') {
        throw new Error(`Push source locale_id not defined (file: ${source.file}, tags: ${source.params.tags})`)
      }

      if (source.params.file_format !== 'i18next') {
        throw new Error(
          `Only i18next format is supported (locale_id: ${source.params.locale_id}, tags: ${source.params.tags})`
        )
      }

      this.sources[source.params.locale_id] = this.sources[source.params.locale_id] || {}
      this.sources[source.params.locale_id][source.params.tags] = source as Source
    })
  }
}

export default Push
