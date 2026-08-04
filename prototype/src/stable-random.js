export const hashText = value => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export const createSeededRandom = seed => {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export const normalizeDsl = value => value.trim().toLowerCase().replace(/\s+/g, ' ')

export const withSeededRandom = (seed, callback) => {
  const originalRandom = Math.random
  Math.random = createSeededRandom(seed)
  try {
    return callback()
  } finally {
    Math.random = originalRandom
  }
}
