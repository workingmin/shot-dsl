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
import {
  SUPPORTED_ACTIONS,
  SUPPORTED_STYLES,
  getModelAction,
  resolveAction,
  resolveModel,
  resolveStyle
} from './catalog.js'
import {
  PROFESSIONAL_SKILL_SCHEMA_VERSION,
  resolveProfessionalSkill,
  skillContractForDispatch
} from './skills.js'

const SUPPORTED_VERSION = '0.1'
export const SUPPORTED_CLIPS = SUPPORTED_ACTIONS
export { SUPPORTED_STYLES }

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
    if (char === '#' && !quoted) {
      const hexadecimalColor = source.slice(index).match(/^#[0-9a-fA-F]{3,8}(?=\s|$)/)
      if (!hexadecimalColor) return source.slice(0, index)
    }
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
      const opening = text.match(/^(scene|actor|object|light|camera|beat|workflow)(?:\s+([A-Za-z_][\w-]*))\s*\{$|^(timeline)\s*\{$/)
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
    style: raw => raw.trim()
  }, diagnostics)
  const fps = fields.fps ?? 24
  let durationMs = 6000
  if (fields.duration !== undefined) {
    try { durationMs = parseTime(fields.duration, fps) }
    catch (error) { diagnostics.push(diagnostic(error.code, error.message, block.lines.find(line => line.text.startsWith('duration '))?.line ?? block.line)) }
  }
  if (durationMs <= 0) diagnostics.push(diagnostic('E_DURATION', 'Scene duration must be greater than zero', block.line))
  if (!Number.isInteger(fps) || fps <= 0 || fps > 120) diagnostics.push(diagnostic('E_FPS', 'Scene fps must be an integer between 1 and 120', block.line))
  const requestedStyle = fields.style ?? 'cinematic'
  const resolvedStyle = resolveStyle(requestedStyle)
  const styleLine = block.lines.find(line => line.text.startsWith('style '))?.line ?? block.line
  if (!resolvedStyle) diagnostics.push(diagnostic('E_STYLE', `Unsupported render style '${requestedStyle}'`, styleLine))
  else if (resolvedStyle.alias) diagnostics.push(diagnostic('W_STYLE_ALIAS', `Style '${requestedStyle}' resolves to '${resolvedStyle.id}'`, styleLine, 1, 'warning'))
  return {
    id: block.id,
    durationMs,
    fps,
    seed: Math.trunc(fields.seed ?? 1),
    style: resolvedStyle?.id ?? requestedStyle,
    ...(resolvedStyle?.alias ? { requestedStyle } : {})
  }
}

const parseBeat = (block, scene, entities, diagnostics) => {
  const fields = readFields(block, {
    from: raw => parseTime(raw, scene.fps),
    to: raw => parseTime(raw, scene.fps),
    intent: parseString,
    emotion: parseString,
    focus: parseTarget,
    continuity: parseIdentifier,
    notes: parseString
  }, diagnostics)
  if (fields.from === undefined || fields.to === undefined) {
    diagnostics.push(diagnostic('E_BEAT_RANGE', `Beat '${block.id}' requires from and to`, block.line))
  } else {
    if (fields.from < 0 || fields.to > scene.durationMs) diagnostics.push(diagnostic('E_BEAT_RANGE', `Beat '${block.id}' is outside scene duration`, block.line))
    if (fields.to <= fields.from) diagnostics.push(diagnostic('E_BEAT_RANGE', `Beat '${block.id}' must end after it starts`, block.line))
  }
  if (!fields.intent) diagnostics.push(diagnostic('E_BEAT_INTENT', `Beat '${block.id}' requires a quoted intent`, block.line))
  if (fields.continuity && !['preserve', 'reset'].includes(fields.continuity)) {
    diagnostics.push(diagnostic('E_BEAT_CONTINUITY', `Beat '${block.id}' continuity must be preserve or reset`, block.line))
  }
  if (fields.focus?.kind === 'entity') {
    const target = entities[fields.focus.entityId]
    if (!target) diagnostics.push(diagnostic('E_UNKNOWN_TARGET', `Beat '${block.id}' focuses unknown entity '${fields.focus.entityId}'`, block.line))
    else if (target.kind !== fields.focus.entityKind) diagnostics.push(diagnostic('E_TARGET_KIND', `Beat '${block.id}' expects ${fields.focus.entityKind} '${fields.focus.entityId}', received ${target.kind}`, block.line))
  }
  return {
    id: block.id,
    fromMs: fields.from ?? 0,
    toMs: fields.to ?? scene.durationMs,
    intent: fields.intent ?? '',
    emotion: fields.emotion ?? '',
    focus: fields.focus ?? null,
    continuity: fields.continuity ?? 'preserve',
    notes: fields.notes ?? ''
  }
}

const parseEntity = (block, diagnostics) => {
  if (block.kind === 'actor') {
    const fields = readFields(block, { ...baseDefinitions, model: parseString, color: raw => raw.trim() }, diagnostics)
    const requestedModel = fields.model ?? 'human-mannequin'
    const resolvedModel = resolveModel(requestedModel)
    const modelLine = block.lines.find(line => line.text.startsWith('model '))?.line ?? block.line
    if (!resolvedModel) diagnostics.push(diagnostic('E_UNKNOWN_MODEL', `Unknown character model '${requestedModel}'`, modelLine))
    else if (resolvedModel.alias) {
      const suffix = resolvedModel.alias.reason ? `: ${resolvedModel.alias.reason}` : ''
      diagnostics.push(diagnostic('W_MODEL_ALIAS', `Model '${requestedModel}' resolves to '${resolvedModel.id}'${suffix}`, modelLine, 1, 'warning'))
    }
    return {
      id: block.id,
      kind: 'actor',
      model: resolvedModel?.id ?? requestedModel,
      ...(resolvedModel?.alias ? { requestedModel } : {}),
      color: fields.color ?? '#d8d4ca',
      transform: transformFrom(fields)
    }
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
    const requestedClip = parseString(tokens[5])
    if (entities[actorId]?.kind !== 'actor') { diagnostics.push(diagnostic('E_UNKNOWN_ACTOR', `Unknown actor '${actorId}'`, entry.line)); return }
    const resolvedAction = resolveAction(requestedClip)
    const clip = resolvedAction?.id ?? requestedClip
    if (!resolvedAction) diagnostics.push(diagnostic('E_UNKNOWN_CLIP', `Unknown character action '${requestedClip}'`, entry.line))
    else if (resolvedAction.alias) diagnostics.push(diagnostic('W_ACTION_ALIAS', `Action '${requestedClip}' resolves to '${clip}'`, entry.line, 1, 'warning'))
    const modelAction = resolvedAction ? getModelAction(entities[actorId].model, clip) : null
    if (resolvedAction && !modelAction) diagnostics.push(diagnostic('E_MODEL_CLIP', `Model '${entities[actorId].model}' does not support action '${clip}'`, entry.line))
    else if (modelAction?.support === 'approximate') {
      const suffix = modelAction.reason ? `: ${modelAction.reason}` : ''
      diagnostics.push(diagnostic('W_APPROXIMATE_CLIP', `Model '${entities[actorId].model}' approximates action '${clip}' with '${modelAction.asset}'${suffix}`, entry.line, 1, 'warning'))
    }
    const event = {
      timeMs,
      type: 'playClip',
      actorId,
      clip,
      ...(resolvedAction?.alias ? { requestedClip } : {}),
      loop: false,
      speed: 1,
      blendMs: 0,
      line: entry.line
    }
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

const parseGaze = (entry, scene, entities, events, diagnostics) => {
  const tokens = tokenizeArguments(entry.text)
  if (tokens.length < 7 || tokens[0] !== 'gaze' || tokens[2] !== 'actor' || tokens[4] !== 'target') {
    diagnostics.push(diagnostic('E_GAZE_SYNTAX', 'Invalid gaze syntax', entry.line))
    return
  }
  try {
    const timeMs = parseTime(tokens[1], scene.fps)
    const actorId = parseIdentifier(tokens[3])
    if (entities[actorId]?.kind !== 'actor') {
      diagnostics.push(diagnostic('E_UNKNOWN_ACTOR', `Unknown gaze actor '${actorId}'`, entry.line))
      return
    }
    const durationIndex = tokens.indexOf('duration', 5)
    const strengthIndex = tokens.indexOf('strength', 5)
    const optionIndexes = [durationIndex, strengthIndex].filter(index => index >= 0)
    const targetEnd = optionIndexes.length ? Math.min(...optionIndexes) : tokens.length
    const target = parseTarget(tokens.slice(5, targetEnd).join(' '))
    if (target.kind === 'entity') {
      const targetEntity = entities[target.entityId]
      if (!targetEntity) diagnostics.push(diagnostic('E_UNKNOWN_TARGET', `Gaze targets unknown entity '${target.entityId}'`, entry.line))
      else if (targetEntity.kind !== target.entityKind) diagnostics.push(diagnostic('E_TARGET_KIND', `Gaze expects ${target.entityKind} '${target.entityId}', received ${targetEntity.kind}`, entry.line))
    }
    const durationMs = durationIndex >= 0 ? parseTime(tokens[durationIndex + 1] ?? '', scene.fps) : scene.durationMs - timeMs
    const strength = strengthIndex >= 0 ? parseNumber(tokens[strengthIndex + 1] ?? '') : 1
    if (durationMs <= 0) diagnostics.push(diagnostic('E_GAZE_DURATION', 'Gaze duration must be greater than zero', entry.line))
    if (strength < 0 || strength > 1) diagnostics.push(diagnostic('E_GAZE_STRENGTH', 'Gaze strength must be between 0 and 1', entry.line))
    events.push({ timeMs, type: 'gaze', actorId, target, durationMs, strength, line: entry.line })
  } catch (error) {
    diagnostics.push(diagnostic(error.code ?? 'E_GAZE', error.message, entry.line))
  }
}

const compileTimeline = (blocks, scene, entities, diagnostics) => {
  const tracks = new Map()
  const events = []
  for (const block of blocks) {
    for (const entry of block.lines) {
      if (entry.text.startsWith('key ')) parseKey(entry, scene, entities, tracks, diagnostics)
      else if (entry.text.startsWith('cut ')) parseCut(entry, scene, entities, events, diagnostics)
      else if (entry.text.startsWith('play ')) parsePlay(entry, scene, entities, events, diagnostics)
      else if (entry.text.startsWith('gaze ')) parseGaze(entry, scene, entities, events, diagnostics)
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

const parseWorkflowScope = (raw, beats, entities, line, diagnostics) => {
  if (raw === 'scene' || raw === 'timeline') return { kind: raw }
  const match = raw.match(/^(beat|actor|object|camera):([A-Za-z_][\w-]*)$/)
  if (!match) {
    diagnostics.push(diagnostic('E_WORKFLOW_SCOPE', `Invalid workflow scope '${raw}'`, line))
    return { kind: 'invalid', id: raw }
  }
  const [, kind, id] = match
  if (kind === 'beat' && !beats[id]) diagnostics.push(diagnostic('E_UNKNOWN_BEAT', `Workflow targets unknown beat '${id}'`, line))
  if (kind !== 'beat' && entities[id]?.kind !== kind) diagnostics.push(diagnostic('E_WORKFLOW_SCOPE', `Workflow targets unknown ${kind} '${id}'`, line))
  return { kind, id }
}

const workflowHasCycle = dispatches => {
  const dependencies = new Map(dispatches.map(item => [item.id, item.after]))
  const visiting = new Set()
  const visited = new Set()
  const visit = id => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of dependencies.get(id) ?? []) {
      if (dependencies.has(dependency) && visit(dependency)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return dispatches.some(item => visit(item.id))
}

const compileWorkflow = (blocks, beats, entities, diagnostics) => {
  if (!blocks.length) return null
  if (blocks.length > 1) diagnostics.push(diagnostic('E_WORKFLOW_COUNT', `Expected at most one workflow block, found ${blocks.length}`, blocks[1].line))
  const block = blocks[0]
  let approval = 'manual'
  let failure = 'stop'
  let approvalSeen = false
  let failureSeen = false
  const dispatches = []
  const dispatchIds = new Set()

  for (const entry of block.lines) {
    if (entry.text.startsWith('approval ')) {
      if (approvalSeen) diagnostics.push(diagnostic('E_DUPLICATE_FIELD', "Field 'approval' is declared more than once", entry.line))
      approvalSeen = true
      approval = entry.text.slice('approval '.length).trim()
      if (!['manual', 'auto'].includes(approval)) diagnostics.push(diagnostic('E_WORKFLOW_APPROVAL', 'Workflow approval must be manual or auto', entry.line))
      continue
    }
    if (entry.text.startsWith('failure ')) {
      if (failureSeen) diagnostics.push(diagnostic('E_DUPLICATE_FIELD', "Field 'failure' is declared more than once", entry.line))
      failureSeen = true
      failure = entry.text.slice('failure '.length).trim()
      if (!['stop', 'continue'].includes(failure)) diagnostics.push(diagnostic('E_WORKFLOW_FAILURE', 'Workflow failure must be stop or continue', entry.line))
      continue
    }

    const match = entry.text.match(/^dispatch\s+([A-Za-z_][\w.-]*)\s+as\s+([A-Za-z_][\w-]*)\s+scope\s+(\S+)\s+mode\s+(review|propose)(?:\s+after\s+([A-Za-z_][\w-]*(?:\s*,\s*[A-Za-z_][\w-]*)*))?$/)
    if (!match) {
      diagnostics.push(diagnostic('E_DISPATCH_SYNTAX', `Invalid workflow statement '${entry.text}'`, entry.line))
      continue
    }
    const [, skillId, id, rawScope, mode, rawAfter = ''] = match
    const after = rawAfter ? rawAfter.split(',').map(value => value.trim()) : []
    const scope = parseWorkflowScope(rawScope, beats, entities, entry.line, diagnostics)
    const skill = resolveProfessionalSkill(skillId)
    if (!skill) diagnostics.push(diagnostic('E_UNKNOWN_SKILL', `Unknown professional skill '${skillId}'`, entry.line))
    else {
      if (!skill.modes.includes(mode)) diagnostics.push(diagnostic('E_SKILL_MODE', `Skill '${skillId}' does not support mode '${mode}'`, entry.line))
      if (!skill.scopes.includes(scope.kind)) diagnostics.push(diagnostic('E_SKILL_SCOPE', `Skill '${skillId}' does not support scope '${scope.kind}'`, entry.line))
    }
    if (dispatchIds.has(id)) diagnostics.push(diagnostic('E_DUPLICATE_DISPATCH', `Dispatch '${id}' is declared more than once`, entry.line))
    dispatchIds.add(id)
    dispatches.push({ id, skillId, skill, mode, scope, after, line: entry.line })
  }

  for (const dispatch of dispatches) {
    for (const dependency of dispatch.after) {
      if (dependency === dispatch.id) diagnostics.push(diagnostic('E_WORKFLOW_CYCLE', `Dispatch '${dispatch.id}' cannot depend on itself`, dispatch.line))
      else if (!dispatchIds.has(dependency)) diagnostics.push(diagnostic('E_UNKNOWN_DISPATCH', `Dispatch '${dispatch.id}' depends on unknown dispatch '${dependency}'`, dispatch.line))
    }
  }
  if (workflowHasCycle(dispatches)) diagnostics.push(diagnostic('E_WORKFLOW_CYCLE', `Workflow '${block.id}' contains a dependency cycle`, block.line))
  if (approval === 'auto' && dispatches.some(item => item.mode === 'propose')) {
    diagnostics.push(diagnostic('E_WORKFLOW_APPROVAL', 'Proposal skills require manual approval before their ShotDSL patches can be applied', block.line))
  }

  return {
    schemaVersion: PROFESSIONAL_SKILL_SCHEMA_VERSION,
    id: block.id,
    approval,
    failure,
    dispatches: dispatches
      .filter(item => item.skill)
      .map(item => skillContractForDispatch(item.skill, item))
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
  const beats = {}
  for (const block of blocks.filter(item => item.kind === 'beat')) {
    if (beats[block.id]) { diagnostics.push(diagnostic('E_DUPLICATE_BEAT', `Beat '${block.id}' is declared more than once`, block.line)); continue }
    beats[block.id] = parseBeat(block, scene, entities, diagnostics)
  }
  const { tracks, events } = compileTimeline(blocks.filter(block => block.kind === 'timeline'), scene, entities, diagnostics)
  const workflow = compileWorkflow(blocks.filter(block => block.kind === 'workflow'), beats, entities, diagnostics)
  if (!Object.values(entities).some(entity => entity.kind === 'camera')) diagnostics.push(diagnostic('E_CAMERA_REQUIRED', 'At least one camera is required', 1))
  if (!events.some(event => event.type === 'cameraCut')) diagnostics.push(diagnostic('E_INITIAL_CUT', 'Timeline requires at least one camera cut', 1))

  const ir = { version, scene, entities, beats, tracks, events, workflow }
  return { ok: diagnostics.every(item => item.severity !== 'error'), diagnostics, ir }
}
