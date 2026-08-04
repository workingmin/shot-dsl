import {
  ValueError,
  parseAngle,
  parseAngleVector,
  parseBoolean,
  parseIdentifier,
  parseLength,
  parseLengthVector,
  parseNumber,
  parseNumberVector,
  parseString,
  parseTime,
  tokenizeArguments
} from './values.js'

const SUPPORTED_VERSION = '0.1'
export const SUPPORTED_CLIPS = new Set([
  'idle', 'guard', 'walk', 'march', 'run', 'stretch', 'dance', 'side-step',
  'jumping-jacks', 'crouch', 'pushup', 'cooldown',
  'punch', 'cross', 'hook', 'kick', 'hit-face', 'fall'
])
export const SUPPORTED_STYLES = new Set(['cinematic', 'rough-ink'])

const diagnostic = (code, message, line, column = 1, severity = 'error') => ({
  code,
  message,
  line,
  column,
  severity
})

const stripComment = source => {
  let quoted = false
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (escaped) { escaped = false; continue }
    if (char === '\\') { escaped = true; continue }
    if (char === '"') quoted = !quoted
    if (char === '#' && !quoted) return source.slice(0, index)
  }
  return source
}

const splitBlocks = (source, diagnostics) => {
  const blocks = []
  const lines = source.split(/\r?\n/)
  let active = null
  let version = null

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1
    const text = stripComment(lines[index]).trim()
    if (!text) continue

    if (!active && text.startsWith('shotdsl ')) {
      if (version !== null) diagnostics.push(diagnostic('E_DUPLICATE_VERSION', 'Only one shotdsl header is allowed', lineNumber))
      else version = text.slice('shotdsl '.length).trim()
      continue
    }

    if (!active) {
      const opening = text.match(/^(scene|actor|object|light|camera)(?:\s+([A-Za-z_][\w-]*))\s*\{$|^(timeline)\s*\{$/)
      if (!opening) {
        diagnostics.push(diagnostic('E_SYNTAX', `Expected a block opening, received '${text}'`, lineNumber))
        continue
      }
      active = { kind: opening[1] ?? opening[3], id: opening[2] ?? null, line: lineNumber, lines: [] }
      continue
    }

    if (text === '}') {
      blocks.push(active)
      active = null
      continue
    }

    if (text.endsWith('{')) {
      diagnostics.push(diagnostic('E_NESTED_BLOCK', 'Nested blocks are not supported', lineNumber))
      continue
    }
    active.lines.push({ text, line: lineNumber })
  }

  if (active) diagnostics.push(diagnostic('E_UNCLOSED_BLOCK', `Block '${active.kind}' is missing a closing brace`, active.line))
  if (version === null) diagnostics.push(diagnostic('E_VERSION_REQUIRED', 'Document must start with shotdsl 0.1', 1))
  else if (version !== SUPPORTED_VERSION) diagnostics.push(diagnostic('E_VERSION_UNSUPPORTED', `Unsupported ShotDSL version '${version}'`, 1))
  return { version, blocks }
}

const readFields = (block, definitions, diagnostics) => {
  const output = {}
  const seen = new Set()
  for (const entry of block.lines) {
    const separator = entry.text.indexOf(' ')
    const name = separator === -1 ? entry.text : entry.text.slice(0, separator)
    const raw = separator === -1 ? '' : entry.text.slice(separator + 1).trim()
    const parse = definitions[name]
    if (!parse) {
      diagnostics.push(diagnostic('E_UNKNOWN_FIELD', `Unknown ${block.kind} field '${name}'`, entry.line))
      continue
    }
    if (seen.has(name)) {
      diagnostics.push(diagnostic('E_DUPLICATE_FIELD', `Field '${name}' is declared more than once`, entry.line))
      continue
    }
    try {
      output[name] = parse(raw)
      seen.add(name)
    } catch (error) {
      if (error instanceof ValueError) diagnostics.push(diagnostic(error.code, error.message, entry.line))
      else throw error
    }
  }
  return output
}

const transformFrom = fields => ({
  position: fields.position ?? [0, 0, 0],
  rotation: fields.rotation ?? [0, 0, 0],
  scale: fields.scale ?? [1, 1, 1],
  visibility: fields.visibility ?? true
})

const baseDefinitions = {
  position: parseLengthVector,
  rotation: parseAngleVector,
  scale: parseNumberVector,
  visibility: parseBoolean
}

const parseTarget = raw => {
  if (raw.startsWith('point ')) return { kind: 'point', point: parseLengthVector(raw.slice(6)) }
  const match = raw.match(/^(actor|object)\s+([A-Za-z_][\w-]*)(?:\s+bone\s+("(?:[^"\\]|\\.)*"))?$/)
  if (!match) throw new ValueError('E_TARGET', `Invalid camera target '${raw}'`)
  return { kind: 'entity', entityKind: match[1], entityId: match[2], bone: match[3] ? parseString(match[3]) : null }
}

const parseScene = (block, diagnostics) => {
  const fields = readFields(block, {
    duration: raw => raw,
    fps: parseNumber,
    seed: parseNumber,
    style: parseIdentifier
  }, diagnostics)
  const fps = fields.fps ?? 24
  let durationMs = 6000
  if (fields.duration !== undefined) {
    try { durationMs = parseTime(fields.duration, fps) }
    catch (error) { diagnostics.push(diagnostic(error.code, error.message, block.lines.find(line => line.text.startsWith('duration '))?.line ?? block.line)) }
  }
  if (durationMs <= 0) diagnostics.push(diagnostic('E_DURATION', 'Scene duration must be greater than zero', block.line))
  if (!Number.isInteger(fps) || fps <= 0 || fps > 120) diagnostics.push(diagnostic('E_FPS', 'Scene fps must be an integer between 1 and 120', block.line))
  const style = fields.style ?? 'cinematic'
  if (!SUPPORTED_STYLES.has(style)) diagnostics.push(diagnostic('E_STYLE', `Unsupported render style '${style}'`, block.line))
  return { id: block.id, durationMs, fps, seed: Math.trunc(fields.seed ?? 1), style }
}

const parseEntity = (block, diagnostics) => {
  if (block.kind === 'actor') {
    const fields = readFields(block, { ...baseDefinitions, model: parseString, color: raw => raw.trim() }, diagnostics)
    return { id: block.id, kind: 'actor', model: fields.model ?? 'human-mannequin', color: fields.color ?? '#d8d4ca', transform: transformFrom(fields) }
  }
  if (block.kind === 'object') {
    const fields = readFields(block, {
      ...baseDefinitions,
      primitive: parseIdentifier,
      model: parseString,
      size: parseLengthVector,
      radius: parseLength,
      height: parseLength,
      color: raw => raw.trim()
    }, diagnostics)
    if (fields.model && fields.primitive) diagnostics.push(diagnostic('E_OBJECT_SOURCE', `Object '${block.id}' cannot declare both model and primitive`, block.line))
    const primitive = fields.primitive ?? 'box'
    if (!['box', 'sphere', 'cylinder', 'cone'].includes(primitive)) diagnostics.push(diagnostic('E_PRIMITIVE', `Unsupported primitive '${primitive}'`, block.line))
    return { id: block.id, kind: 'object', primitive, model: fields.model, size: fields.size ?? [1, 1, 1], radius: fields.radius ?? 0.5, height: fields.height ?? 1, color: fields.color ?? '#d6d2c8', transform: transformFrom(fields) }
  }
  if (block.kind === 'light') {
    const fields = readFields(block, {
      type: parseIdentifier,
      intensity: parseNumber,
      color: raw => raw.trim(),
      position: parseLengthVector,
      target: parseTarget
    }, diagnostics)
    return { id: block.id, kind: 'light', type: fields.type ?? 'directional', intensity: fields.intensity ?? 2, color: fields.color ?? '#ffffff', position: fields.position ?? [3, 6, 4], target: fields.target ?? { kind: 'point', point: [0, 0, 0] } }
  }
  if (block.kind === 'camera') {
    const fields = readFields(block, {
      ...baseDefinitions,
      mode: parseIdentifier,
      fov: parseAngle,
      target: parseTarget,
      attacker: parseTarget,
      victim: parseTarget,
      offset: parseLengthVector,
      radius: parseLength,
      distance: parseLength,
      azimuth: parseAngle,
      elevation: parseAngle,
      side: parseIdentifier,
      focus: parseNumber,
      shake: parseLength,
      roll: parseAngle
    }, diagnostics)
    const mode = fields.mode ?? 'lookAt'
    if (!['fixed', 'lookAt', 'follow', 'orbit', 'impact'].includes(mode)) diagnostics.push(diagnostic('E_CAMERA_MODE', `Unsupported camera mode '${mode}'`, block.line))
    if (['lookAt', 'follow', 'orbit'].includes(mode) && !fields.target) diagnostics.push(diagnostic('E_CAMERA_TARGET', `Camera '${block.id}' mode ${mode} requires target`, block.line))
    if (mode === 'impact' && (!fields.attacker || !fields.victim)) diagnostics.push(diagnostic('E_CAMERA_IMPACT_TARGETS', `Camera '${block.id}' mode impact requires attacker and victim`, block.line))
    if (mode === 'impact' && [fields.attacker, fields.victim].some(target => target && (target.entityKind !== 'actor' || !target.bone))) diagnostics.push(diagnostic('E_CAMERA_IMPACT_BONE', `Camera '${block.id}' impact targets must be actor bones`, block.line))
    if (fields.side && !['left', 'right'].includes(fields.side)) diagnostics.push(diagnostic('E_CAMERA_SIDE', `Camera '${block.id}' side must be left or right`, block.line))
    if (fields.distance !== undefined && fields.distance <= 0) diagnostics.push(diagnostic('E_CAMERA_DISTANCE', `Camera '${block.id}' distance must be greater than zero`, block.line))
    if (fields.focus !== undefined && (fields.focus < 0 || fields.focus > 1)) diagnostics.push(diagnostic('E_CAMERA_FOCUS', `Camera '${block.id}' focus must be between 0 and 1`, block.line))
    if (fields.shake !== undefined && fields.shake < 0) diagnostics.push(diagnostic('E_CAMERA_SHAKE', `Camera '${block.id}' shake cannot be negative`, block.line))
    return {
      id: block.id,
      kind: 'camera',
      mode,
      fov: fields.fov ?? 45 * Math.PI / 180,
      target: fields.target ?? null,
      attacker: fields.attacker ?? null,
      victim: fields.victim ?? null,
      offset: fields.offset ?? (mode === 'impact' ? [0, 0, 0] : [0, 1.5, 5]),
      radius: fields.radius ?? 5,
      distance: fields.distance ?? 1.6,
      azimuth: fields.azimuth ?? 0,
      elevation: fields.elevation ?? 15 * Math.PI / 180,
      side: fields.side ?? 'right',
      focus: fields.focus ?? 0.68,
      shake: fields.shake ?? 0,
      roll: fields.roll ?? 0,
      transform: transformFrom(fields)
    }
  }
  return null
}

const propertyParsers = {
  position: { type: 'vector3', parse: parseLengthVector },
  rotation: { type: 'rotation', parse: parseAngleVector },
  scale: { type: 'vector3', parse: parseNumberVector },
  visibility: { type: 'boolean', parse: parseBoolean },
  offset: { type: 'vector3', parse: parseLengthVector },
  fov: { type: 'number', parse: parseAngle },
  radius: { type: 'number', parse: parseLength },
  azimuth: { type: 'number', parse: parseAngle },
  elevation: { type: 'number', parse: parseAngle },
  shake: { type: 'number', parse: parseLength },
  roll: { type: 'number', parse: parseAngle }
}

const animatableByKind = {
  actor: new Set(['position', 'rotation', 'scale', 'visibility']),
  object: new Set(['position', 'rotation', 'scale', 'visibility']),
  light: new Set(),
  camera: new Set(['position', 'rotation', 'visibility', 'fov', 'offset', 'radius', 'azimuth', 'elevation', 'shake', 'roll'])
}

const parseKey = (entry, scene, entities, tracks, diagnostics) => {
  const match = entry.text.match(/^key\s+(\S+)\s+([A-Za-z_][\w-]*)\.([A-Za-z_][\w-]*)\s+(.+?)(?:\s+ease\s+(linear|smoothstep|hold))?$/)
  if (!match) {
    diagnostics.push(diagnostic('E_KEY_SYNTAX', 'Invalid key syntax', entry.line))
    return
  }
  const [, rawTime, entityId, property, rawValue, interpolation = 'linear'] = match
  const entity = entities[entityId]
  if (!entity) { diagnostics.push(diagnostic('E_UNKNOWN_ENTITY', `Unknown key target '${entityId}'`, entry.line)); return }
  const descriptor = propertyParsers[property]
  if (!descriptor) { diagnostics.push(diagnostic('E_UNKNOWN_PROPERTY', `Unsupported animated property '${property}'`, entry.line)); return }
  if (!animatableByKind[entity.kind]?.has(property)) {
    diagnostics.push(diagnostic('E_PROPERTY_KIND', `Property '${property}' cannot be animated on ${entity.kind} '${entityId}'`, entry.line))
    return
  }
  try {
    const timeMs = parseTime(rawTime, scene.fps)
    const value = descriptor.parse(rawValue)
    const target = `${entityId}.${property}`
    if (!tracks.has(target)) tracks.set(target, { target, entityId, property, valueType: descriptor.type, keys: [] })
    tracks.get(target).keys.push({ timeMs, value, interpolation, line: entry.line })
  } catch (error) {
    diagnostics.push(diagnostic(error.code ?? 'E_KEY_VALUE', error.message, entry.line))
  }
}

const parseCut = (entry, scene, entities, events, diagnostics) => {
  const match = entry.text.match(/^cut\s+(\S+)\s+camera\s+([A-Za-z_][\w-]*)$/)
  if (!match) { diagnostics.push(diagnostic('E_CUT_SYNTAX', 'Invalid camera cut syntax', entry.line)); return }
  try {
    const timeMs = parseTime(match[1], scene.fps)
    if (entities[match[2]]?.kind !== 'camera') diagnostics.push(diagnostic('E_UNKNOWN_CAMERA', `Unknown camera '${match[2]}'`, entry.line))
    else events.push({ timeMs, type: 'cameraCut', cameraId: match[2], line: entry.line })
  } catch (error) { diagnostics.push(diagnostic(error.code, error.message, entry.line)) }
}

const parsePlay = (entry, scene, entities, events, diagnostics) => {
  const tokens = tokenizeArguments(entry.text)
  if (tokens.length < 6 || tokens[0] !== 'play' || tokens[2] !== 'actor' || tokens[4] !== 'clip') {
    diagnostics.push(diagnostic('E_PLAY_SYNTAX', 'Invalid play event syntax', entry.line)); return
  }
  try {
    const timeMs = parseTime(tokens[1], scene.fps)
    const actorId = parseIdentifier(tokens[3])
    const clip = parseString(tokens[5])
    if (entities[actorId]?.kind !== 'actor') { diagnostics.push(diagnostic('E_UNKNOWN_ACTOR', `Unknown actor '${actorId}'`, entry.line)); return }
    if (!SUPPORTED_CLIPS.has(clip)) diagnostics.push(diagnostic('E_UNKNOWN_CLIP', `Unknown character clip '${clip}'`, entry.line))
    const event = { timeMs, type: 'playClip', actorId, clip, loop: false, speed: 1, blendMs: 0, line: entry.line }
    for (let index = 6; index < tokens.length; index += 2) {
      const name = tokens[index]
      const value = tokens[index + 1]
      if (value === undefined) throw new ValueError('E_PLAY_OPTION', `Missing value for play option '${name}'`)
      if (name === 'loop') event.loop = parseBoolean(value)
      else if (name === 'speed') event.speed = parseNumber(value)
      else if (name === 'blend') event.blendMs = parseTime(value, scene.fps)
      else throw new ValueError('E_PLAY_OPTION', `Unknown play option '${name}'`)
    }
    events.push(event)
  } catch (error) { diagnostics.push(diagnostic(error.code ?? 'E_PLAY', error.message, entry.line)) }
}

const compileTimeline = (blocks, scene, entities, diagnostics) => {
  const tracks = new Map()
  const events = []
  for (const block of blocks) {
    for (const entry of block.lines) {
      if (entry.text.startsWith('key ')) parseKey(entry, scene, entities, tracks, diagnostics)
      else if (entry.text.startsWith('cut ')) parseCut(entry, scene, entities, events, diagnostics)
      else if (entry.text.startsWith('play ')) parsePlay(entry, scene, entities, events, diagnostics)
      else diagnostics.push(diagnostic('E_TIMELINE_STATEMENT', `Unknown timeline statement '${entry.text.split(' ')[0]}'`, entry.line))
    }
  }
  for (const track of tracks.values()) {
    track.keys.sort((a, b) => a.timeMs - b.timeMs)
    for (let index = 0; index < track.keys.length; index += 1) {
      const key = track.keys[index]
      if (key.timeMs < 0 || key.timeMs > scene.durationMs) diagnostics.push(diagnostic('E_TIME_RANGE', `Key ${key.timeMs}ms is outside scene duration`, key.line))
      if (index && key.timeMs === track.keys[index - 1].timeMs) diagnostics.push(diagnostic('E_DUPLICATE_KEY', `Track '${track.target}' has duplicate keys at ${key.timeMs}ms`, key.line))
    }
  }
  events.sort((a, b) => a.timeMs - b.timeMs)
  for (const event of events) {
    if (event.timeMs < 0 || event.timeMs > scene.durationMs) diagnostics.push(diagnostic('E_TIME_RANGE', `Event ${event.timeMs}ms is outside scene duration`, event.line))
  }
  return { tracks: [...tracks.values()].map(track => ({ ...track, keys: track.keys.map(({ line, ...key }) => key) })), events: events.map(({ line, ...event }) => event) }
}

const validateReferences = (entities, diagnostics) => {
  for (const entity of Object.values(entities)) {
    for (const target of [entity.target, entity.attacker, entity.victim]) {
      if (target?.kind === 'entity' && !entities[target.entityId]) {
        diagnostics.push(diagnostic('E_UNKNOWN_TARGET', `${entity.kind} '${entity.id}' targets unknown entity '${target.entityId}'`, 1))
      } else if (target?.kind === 'entity' && entities[target.entityId].kind !== target.entityKind) {
        diagnostics.push(diagnostic('E_TARGET_KIND', `${entity.kind} '${entity.id}' expects ${target.entityKind} '${target.entityId}', received ${entities[target.entityId].kind}`, 1))
      }
    }
  }
}

export const compileShotDSL = source => {
  const diagnostics = []
  const { version, blocks } = splitBlocks(source, diagnostics)
  const sceneBlocks = blocks.filter(block => block.kind === 'scene')
  if (sceneBlocks.length !== 1) diagnostics.push(diagnostic('E_SCENE_COUNT', `Expected exactly one scene block, found ${sceneBlocks.length}`, 1))
  const scene = sceneBlocks[0] ? parseScene(sceneBlocks[0], diagnostics) : { id: 'invalid', durationMs: 6000, fps: 24, seed: 1, style: 'rough-ink' }

  const entities = {}
  for (const block of blocks.filter(item => ['actor', 'object', 'light', 'camera'].includes(item.kind))) {
    if (entities[block.id]) { diagnostics.push(diagnostic('E_DUPLICATE_ID', `Entity '${block.id}' is declared more than once`, block.line)); continue }
    entities[block.id] = parseEntity(block, diagnostics)
  }
  validateReferences(entities, diagnostics)
  const { tracks, events } = compileTimeline(blocks.filter(block => block.kind === 'timeline'), scene, entities, diagnostics)
  if (!Object.values(entities).some(entity => entity.kind === 'camera')) diagnostics.push(diagnostic('E_CAMERA_REQUIRED', 'At least one camera is required', 1))
  if (!events.some(event => event.type === 'cameraCut')) diagnostics.push(diagnostic('E_INITIAL_CUT', 'Timeline requires at least one camera cut', 1))

  const ir = { version, scene, entities, tracks, events }
  return { ok: diagnostics.every(item => item.severity !== 'error'), diagnostics, ir }
}
