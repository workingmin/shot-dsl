import test from 'node:test'
import assert from 'node:assert/strict'
import { readStoryboardExamples } from '../../scripts/example-files.mjs'
import { compileShotDSL } from './parser.js'

const examples = await readStoryboardExamples()
const exampleForScene = sceneId => examples.find(example => example.source.includes(`scene ${sceneId} {`))

test('all focused storyboard examples compile into deterministic Scene IR', () => {
  assert.equal(examples.length, 4)
  for (const example of examples) {
    const result = compileShotDSL(example.source)
    assert.equal(result.ok, true, `${example.label}: ${JSON.stringify(result.diagnostics)}`)
    assert.equal(result.ir.scene.style, 'storyboard')
    assert.equal('workflow' in result.ir, false)
    assert.ok(result.ir.events.some(event => event.type === 'note'))
    assert.ok(result.ir.events.some(event => event.type === 'cameraCut'))
  }
})

test('compiler normalizes units, sorts keys and keeps design data above frame level', () => {
  const result = compileShotDSL(exampleForScene('forest_tracking_blocking').source)
  assert.equal(result.ok, true)
  assert.equal(result.ir.scene.durationMs, 10000)
  assert.equal(result.ir.scene.fps, 24)
  const track = result.ir.tracks.find(item => item.target === 'scout.position')
  assert.deepEqual(track.keys.map(key => key.timeMs), [0, 4200, 7100, 10000])
  assert.equal('frames' in result.ir, false)
})

test('notes, attach and IK compile as explicit timeline events', () => {
  const handoff = compileShotDSL(exampleForScene('four_actor_prop_handoff').source)
  assert.equal(handoff.ok, true)
  const note = handoff.ir.events.find(event => event.type === 'note')
  assert.equal(note.text, '全景：四人站位和道具传递方向')
  assert.equal(note.durationMs, 2000)
  const attach = handoff.ir.events.find(event => event.type === 'attach')
  assert.equal(attach.objectId, 'envelope')
  assert.equal(attach.releaseMs, 4500)
  assert.ok(handoff.ir.events.some(event => event.type === 'ik'))
})

test('beats preserve storyboard intent, focus and notes', () => {
  const result = compileShotDSL(exampleForScene('noodle_shop_continuity').source)
  assert.equal(result.ok, true)
  assert.deepEqual(result.ir.beats.arrival, {
    id: 'arrival',
    fromMs: 0,
    toMs: 4000,
    intent: '顾客从入口走向柜台，保持由右向左的运动方向',
    emotion: '',
    focus: { kind: 'entity', entityKind: 'actor', entityId: 'customer', bone: null },
    continuity: 'preserve',
    notes: ''
  })
})

test('legacy style and model names migrate with warnings', () => {
  const source = exampleForScene('forest_tracking_blocking').source
    .replace('style storyboard', 'style rough-ink')
    .replaceAll('model "storyboard-mannequin"', 'model "human-mannequin"')
  const result = compileShotDSL(source)
  assert.equal(result.ok, true)
  assert.equal(result.ir.scene.style, 'storyboard')
  assert.ok(result.diagnostics.some(item => item.code === 'W_STYLE_ALIAS'))
  assert.ok(result.diagnostics.some(item => item.code === 'W_MODEL_ALIAS'))
})

test('removed cinematic and combat semantics fail clearly', () => {
  const source = exampleForScene('forest_tracking_blocking').source
    .replace('style storyboard', 'style cinematic')
    .replace('clip "walk"', 'clip "punch"')
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_STYLE'))
  assert.ok(result.diagnostics.some(item => item.code === 'E_UNKNOWN_CLIP'))
})

test('compiler returns line-addressable diagnostics instead of guessing', () => {
  const result = compileShotDSL('shotdsl 0.1\nscene broken {\n duration 5\n}\n')
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.length >= 2)
  assert.ok(result.diagnostics.every(item => Number.isInteger(item.line) && item.line > 0))
})

test('duplicate keys and properties on the wrong entity kind are rejected', () => {
  const original = exampleForScene('forest_tracking_blocking').source
  const duplicate = compileShotDSL(original.replace(
    'key 0s scout.position [-4m, 0m, 0.5m]',
    'key 0s scout.position [-4m, 0m, 0.5m]\n  key 0s scout.position [-3m, 0m, 0.5m]'
  ))
  assert.ok(duplicate.diagnostics.some(item => item.code === 'E_DUPLICATE_KEY'))

  const wrongKind = compileShotDSL(original.replace(
    'key 0s scout.position [-4m, 0m, 0.5m]',
    'key 0s establish.scale [1, 1, 1]'
  ))
  assert.ok(wrongKind.diagnostics.some(item => item.code === 'E_PROPERTY_KIND'))
})
