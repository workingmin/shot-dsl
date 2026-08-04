export class ValueError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ValueError'
    this.code = code
  }
}

const numberPattern = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)'

const parseUnit = (source, units, kind) => {
  const match = source.trim().match(new RegExp(`^(${numberPattern})(${Object.keys(units).join('|')})$`))
  if (!match) throw new ValueError('E_UNIT', `Expected ${kind} with unit, received '${source.trim()}'`)
  return Number(match[1]) * units[match[2]]
}

export const parseTime = (source, fps = 24) => {
  const value = source.trim()
  if (value.endsWith('f')) {
    const frames = Number(value.slice(0, -1))
    if (!Number.isFinite(frames)) throw new ValueError('E_TIME', `Invalid frame time '${value}'`)
    return frames * 1000 / fps
  }
  return parseUnit(value, { ms: 1, s: 1000 }, 'time')
}

export const parseLength = source => parseUnit(source, { cm: 0.01, m: 1 }, 'length')
export const parseAngle = source => parseUnit(source, { deg: Math.PI / 180, rad: 1 }, 'angle')

export const parseNumber = source => {
  const value = Number(source.trim())
  if (!Number.isFinite(value)) throw new ValueError('E_NUMBER', `Expected number, received '${source.trim()}'`)
  return value
}

export const parseBoolean = source => {
  if (source.trim() === 'true') return true
  if (source.trim() === 'false') return false
  throw new ValueError('E_BOOLEAN', `Expected true or false, received '${source.trim()}'`)
}

export const parseString = source => {
  const value = source.trim()
  const match = value.match(/^"((?:[^"\\]|\\.)*)"$/)
  if (!match) throw new ValueError('E_STRING', `Expected quoted string, received '${value}'`)
  return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
}

export const parseIdentifier = source => {
  const value = source.trim()
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
    throw new ValueError('E_ID', `Invalid identifier '${value}'`)
  }
  return value
}

export const parseVector = (source, itemParser, label = 'vector') => {
  const match = source.trim().match(/^\[(.*)]$/)
  if (!match) throw new ValueError('E_VECTOR', `Expected ${label} in [x, y, z] form`)
  const parts = match[1].split(',').map(item => item.trim())
  if (parts.length !== 3) throw new ValueError('E_VECTOR_SIZE', `${label} must contain exactly three values`)
  return parts.map(itemParser)
}

export const parseLengthVector = source => parseVector(source, parseLength, 'length vector')
export const parseAngleVector = source => parseVector(source, parseAngle, 'angle vector')
export const parseNumberVector = source => parseVector(source, parseNumber, 'number vector')

export const tokenizeArguments = source => {
  const tokens = []
  const pattern = /"(?:[^"\\]|\\.)*"|\[[^\]]*]|\S+/g
  for (const match of source.matchAll(pattern)) tokens.push(match[0])
  return tokens
}
