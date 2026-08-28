import { Euler, Quaternion } from 'three'

const clamp01 = value => Math.max(0, Math.min(1, value))
const smoothstep = value => value * value * (3 - 2 * value)

const interpolateRotation = (from, to, alpha) => {
  const a = new Quaternion().setFromEuler(new Euler(...from, 'XYZ'))
  const b = new Quaternion().setFromEuler(new Euler(...to, 'XYZ'))
  a.slerp(b, alpha)
  return [a.x, a.y, a.z, a.w]
}

export const evaluateTrack = (track, timeMs) => {
  const keys = track.keys
  if (keys.length === 0 || timeMs < keys[0].timeMs) return undefined
  if (timeMs >= keys[keys.length - 1].timeMs) {
    const value = keys[keys.length - 1].value
    return track.valueType === 'rotation' ? interpolateRotation(value, value, 0) : structuredClone(value)
  }
  let upperIndex = 1
  while (upperIndex < keys.length && keys[upperIndex].timeMs <= timeMs) upperIndex += 1
  const from = keys[upperIndex - 1]
  const to = keys[upperIndex]
  if (to.interpolation === 'hold') return track.valueType === 'rotation' ? interpolateRotation(from.value, from.value, 0) : structuredClone(from.value)
  let alpha = clamp01((timeMs - from.timeMs) / (to.timeMs - from.timeMs))
  if (to.interpolation === 'smoothstep') alpha = smoothstep(alpha)
  if (track.valueType === 'rotation') return interpolateRotation(from.value, to.value, alpha)
  if (track.valueType === 'vector3') return from.value.map((value, index) => value + (to.value[index] - value) * alpha)
  if (track.valueType === 'number') return from.value + (to.value - from.value) * alpha
  return alpha < 1 ? from.value : to.value
}

export const evaluateTimeline = (ir, timeMs) => {
  const clampedTime = Math.max(0, Math.min(ir.scene.durationMs, timeMs))
  const values = new Map()
  for (const track of ir.tracks) {
    const value = evaluateTrack(track, clampedTime)
    if (value !== undefined) values.set(track.target, value)
  }

  let activeCameraId = Object.values(ir.entities).find(entity => entity.kind === 'camera')?.id ?? null
  const clipEvents = new Map()
  const gazes = new Map()
  const attachments = new Map()
  const ikConstraints = new Map()
  const notes = []
  for (const event of ir.events) {
    if (event.timeMs > clampedTime) break
    if (event.type === 'cameraCut') activeCameraId = event.cameraId
    if (event.type === 'playClip') {
      const active = clipEvents.get(event.actorId)
      clipEvents.set(event.actorId, { current: event, previous: active?.current ?? null })
    }
    if (event.type === 'gaze') {
      if (clampedTime < event.timeMs + event.durationMs) gazes.set(event.actorId, { ...event, elapsedMs: clampedTime - event.timeMs })
      else gazes.delete(event.actorId)
    }
    if (event.type === 'attach') {
      if (event.releaseMs && clampedTime >= event.releaseMs) attachments.delete(event.objectId)
      else attachments.set(event.objectId, { ...event, elapsedMs: clampedTime - event.timeMs })
    }
    if (event.type === 'ik') {
      if (clampedTime < event.timeMs + event.durationMs) ikConstraints.set(event.actorId, { ...event, elapsedMs: clampedTime - event.timeMs })
      else ikConstraints.delete(event.actorId)
    }
    if (event.type === 'note') {
      if (clampedTime < event.timeMs + event.durationMs) {
        notes.push({ ...event, elapsedMs: clampedTime - event.timeMs })
      }
    }
  }
  const clips = new Map()
  for (const [actorId, state] of clipEvents) {
    const current = {
      ...state.current,
      elapsedMs: (clampedTime - state.current.timeMs) * state.current.speed
    }
    if (state.previous && current.blendMs > 0 && current.elapsedMs < current.blendMs) {
      current.previous = {
        ...state.previous,
        elapsedMs: (clampedTime - state.previous.timeMs) * state.previous.speed
      }
    }
    clips.set(actorId, current)
  }
  return { timeMs: clampedTime, values, activeCameraId, clips, gazes, attachments, ikConstraints, notes }
}
