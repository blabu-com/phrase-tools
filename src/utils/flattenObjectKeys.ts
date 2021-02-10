import isPlainObject from 'lodash/isPlainObject'

type Options = {
  traverseArrays?: boolean
}

/**
 * Returns array of paths of all object's leaf nodes
 * Each path is defined as array of keys
 */
const flattenObjectKeys = (obj, options: Options = {}, parentKeys = []) => {
  const { traverseArrays = true } = options
  return Object.keys(obj).reduce((acc, key) => {
    const o =
      (isPlainObject(obj[key]) && Object.keys(obj[key]).length > 0) ||
      (traverseArrays && Array.isArray(obj[key]) && obj[key].length > 0)
        ? flattenObjectKeys(obj[key], options, parentKeys.concat(key))
        : [parentKeys.concat(key)]
    return acc.concat(o)
  }, [])
}

export default flattenObjectKeys
