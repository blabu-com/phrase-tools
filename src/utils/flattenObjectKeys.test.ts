import flattenObjectKeys from './flattenObjectKeys'

describe('flattenObjectKeys', () => {
  it('returns flat paths from given object', () => {
    expect(
      flattenObjectKeys({
        a: {
          b: {
            c: [],
            d: {
              e: [{ f: [1] }, { b: 2 }],
              g: {}
            }
          }
        }
      })
    ).toEqual([
      ['a', 'b', 'c'],
      ['a', 'b', 'd', 'e', '0', 'f', '0'],
      ['a', 'b', 'd', 'e', '1', 'b'],
      ['a', 'b', 'd', 'g']
    ])
  })

  it('returns flat paths from given object and allows to omit array traversing', () => {
    expect(
      flattenObjectKeys(
        {
          a: {
            b: {
              c: [],
              d: {
                e: [{ f: [1] }, { b: 2 }],
                g: {}
              }
            }
          }
        },
        { traverseArrays: false }
      )
    ).toEqual([
      ['a', 'b', 'c'],
      ['a', 'b', 'd', 'e'],
      ['a', 'b', 'd', 'g']
    ])
  })
})
