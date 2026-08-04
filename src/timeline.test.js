import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateTimeline, evaluateTrack } from './timeline.js'

test('linear, smoothstep and hold tracks evaluate at absolute time', () => {
  const smooth = {
    valueType: 'vector3',
    keys: [
      { timeMs: 0, value: [0, 0, 0], interpolation: 'linear' },
      { timeMs: 1000, value: [10, 0, 0], interpolation: 'smoothstep' }
    ]
  }
  assert.deepEqual(evaluateTrack(smooth, 250), [1.5625, 0, 0])
  assert.deepEqual(evaluateTrack(smooth, 1000), [10, 0, 0])

  const hold = { ...smooth, keys: smooth.keys.map(key => ({ ...key })), valueType: 'number' }
  hold.keys = [
    { timeMs: 0, value: 2, interpolation: 'linear' },
    { timeMs: 1000, value: 8, interpolation: 'hold' }
  ]
  assert.equal(evaluateTrack(hold, 999), 2)
  assert.equal(evaluateTrack(hold, 1000), 8)
})

test('rotation tracks use quaternion slerp', () => {
  const track = {
    valueType: 'rotation',
    keys: [
      { timeMs: 0, value: [0, 0, 0], interpolation: 'linear' },
      { timeMs: 1000, value: [0, Math.PI, 0], interpolation: 'linear' }
    ]
  }
  const quaternion = evaluateTrack(track, 500)
  assert.ok(Math.abs(Math.abs(quaternion[1]) - Math.SQRT1_2) < 1e-6)
  assert.ok(Math.abs(Math.abs(quaternion[3]) - Math.SQRT1_2) < 1e-6)
})

test('camera cuts and clips resolve identically when seeking out of order', () => {
  const ir = {
    scene: { durationMs: 5000 },
    entities: { a: { id: 'a', kind: 'actor' }, wide: { id: 'wide', kind: 'camera' }, close: { id: 'close', kind: 'camera' } },
    tracks: [],
    events: [
      { timeMs: 0, type: 'cameraCut', cameraId: 'wide' },
      { timeMs: 500, type: 'playClip', actorId: 'a', clip: 'run', loop: true, speed: 1 },
      { timeMs: 1800, type: 'cameraCut', cameraId: 'close' },
      { timeMs: 2000, type: 'playClip', actorId: 'a', clip: 'punch', loop: false, speed: 1 }
    ]
  }
  evaluateTimeline(ir, 4000)
  const first = evaluateTimeline(ir, 2400)
  evaluateTimeline(ir, 100)
  const second = evaluateTimeline(ir, 2400)
  assert.deepEqual(second, first)
  assert.equal(first.activeCameraId, 'close')
  assert.equal(first.clips.get('a').clip, 'punch')
  assert.equal(first.clips.get('a').elapsedMs, 400)
})

test('clip evaluation exposes the previous action only inside blend window', () => {
  const ir = {
    scene: { durationMs: 3000 },
    entities: { hero: { id: 'hero', kind: 'actor' }, cam: { id: 'cam', kind: 'camera' } },
    tracks: [],
    events: [
      { timeMs: 0, type: 'playClip', actorId: 'hero', clip: 'run', loop: true, speed: 1, blendMs: 0 },
      { timeMs: 1000, type: 'playClip', actorId: 'hero', clip: 'punch', loop: false, speed: 1, blendMs: 200 }
    ]
  }
  const blending = evaluateTimeline(ir, 1100).clips.get('hero')
  assert.equal(blending.clip, 'punch')
  assert.equal(blending.elapsedMs, 100)
  assert.equal(blending.previous.clip, 'run')
  assert.equal(blending.previous.elapsedMs, 1100)
  assert.equal(evaluateTimeline(ir, 1250).clips.get('hero').previous, undefined)
})
