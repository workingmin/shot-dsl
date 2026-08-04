import test from 'node:test'
import assert from 'node:assert/strict'
import { EXAMPLES } from '../examples.js'
import { compileShotDSL } from './parser.js'

test('all bundled examples compile into deterministic Scene IR', () => {
  for (const example of EXAMPLES) {
    const result = compileShotDSL(example.source)
    assert.equal(result.ok, true, `${example.id}: ${JSON.stringify(result.diagnostics)}`)
    assert.equal(result.ir.version, '0.1')
    assert.ok(Object.keys(result.ir.entities).length >= 3)
    assert.ok(result.ir.events.some(event => event.type === 'cameraCut'))
  }
})

test('compiler normalizes units and sorts keys', () => {
  const source = `shotdsl 0.1
scene test {\n  duration 48f\n  fps 24\n  seed 1\n  style rough-ink\n}
actor hero {\n  model "humanoid"\n  position [0cm, 0m, 0m]\n}
camera cam {\n  mode lookAt\n  position [0m, 2m, 5m]\n  target actor hero\n}
timeline {\n  key 1s hero.position [100cm, 0m, 0m]\n  key 0s hero.position [0m, 0m, 0m]\n  cut 0s camera cam\n}`
  const result = compileShotDSL(source)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.equal(result.ir.scene.durationMs, 2000)
  assert.deepEqual(result.ir.tracks[0].keys.map(key => key.timeMs), [0, 1000])
  assert.deepEqual(result.ir.tracks[0].keys[1].value, [1, 0, 0])
})

test('compiler returns line-addressable diagnostics instead of guessing', () => {
  const source = `shotdsl 0.1
scene broken {\n  duration 5\n  fps 24\n}
actor hero {\n  position [0m, 0m, 0m]\n}
timeline {\n  cut 0s camera missing\n}`
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_UNIT' && item.line === 3))
  assert.ok(result.diagnostics.some(item => item.code === 'E_UNKNOWN_CAMERA'))
  assert.ok(result.diagnostics.every(item => Number.isInteger(item.line)))
})

test('duplicate keys at the same time are rejected', () => {
  const source = EXAMPLES[0].source.replace(
    'key 1.2s hero.position [-0.4m, 0m, 0m] ease smoothstep',
    'key 1.2s hero.position [-0.4m, 0m, 0m] ease smoothstep\n  key 1.2s hero.position [0m, 0m, 0m]'
  )
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_DUPLICATE_KEY'))
})

test('semantic compiler rejects properties on the wrong entity kind', () => {
  const source = EXAMPLES[0].source.replace(
    'key 0s hero.position [-1.7m, 0m, 0m]',
    'key 0s hero.fov 35deg'
  )
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_PROPERTY_KIND'))
})

test('impact camera compiles two actor bone targets into Scene IR', () => {
  const example = EXAMPLES.find(item => item.id === 'face-impact')
  const result = compileShotDSL(example.source)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  const camera = result.ir.entities.face_impact
  assert.equal(camera.mode, 'impact')
  assert.deepEqual(camera.attacker, { kind: 'entity', entityKind: 'actor', entityId: 'boxer', bone: 'hand_l' })
  assert.deepEqual(camera.victim, { kind: 'entity', entityKind: 'actor', entityId: 'opponent', bone: 'head' })
  assert.equal(camera.distance, 1.45)
  assert.equal(camera.side, 'right')
  assert.equal(camera.focus, 0.72)
})

test('impact camera requires two actor bone targets', () => {
  const source = EXAMPLES.find(item => item.id === 'face-impact').source.replace(
    '  victim actor opponent bone "head"\n',
    ''
  )
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_CAMERA_IMPACT_TARGETS'))
})
