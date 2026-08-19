import test from 'node:test'
import assert from 'node:assert/strict'
import { readExamples } from '../../scripts/example-files.mjs'
import { compileShotDSL } from './parser.js'

const EXAMPLES = await readExamples()
const exampleForScene = sceneId => EXAMPLES.find(example => example.source.includes(`scene ${sceneId} {`))

test('all bundled examples compile into deterministic Scene IR', () => {
  assert.equal(EXAMPLES.length, 7)
  for (const example of EXAMPLES) {
    const result = compileShotDSL(example.source)
    assert.equal(result.ok, true, `${example.id}: ${JSON.stringify(result.diagnostics)}`)
    assert.equal(result.ir.version, '0.1')
    assert.ok(Object.keys(result.ir.entities).length >= 3)
    assert.ok(Object.keys(result.ir.beats).length >= 3)
    assert.equal(result.ir.workflow?.dispatches.length, 6)
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

test('hex colors are values while hash-prefixed prose remains a comment', () => {
  const example = exampleForScene('forest_tracking_prop_action')
  const result = compileShotDSL(example.source)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.equal(result.ir.entities.forest_floor.color, '#465143')
  assert.equal(result.ir.entities.ridge.color, '#50584e')
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
  const source = exampleForScene('forest_tracking_prop_action').source.replace(
    'key 3.1s scout.position [-1.5m, 0m, 0.4m] ease smoothstep',
    'key 3.1s scout.position [-1.5m, 0m, 0.4m] ease smoothstep\n  key 3.1s scout.position [0m, 0m, 0m]'
  )
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_DUPLICATE_KEY'))
})

test('semantic compiler rejects properties on the wrong entity kind', () => {
  const source = exampleForScene('forest_tracking_prop_action').source.replace(
    'key 0.65s scout.position [-4.2m, 0m, 0.4m]',
    'key 0.65s scout.fov 35deg'
  )
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_PROPERTY_KIND'))
})

test('impact camera compiles two actor bone targets into Scene IR', () => {
  const example = exampleForScene('battlefield_attack_response_chain')
  const result = compileShotDSL(example.source)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  const camera = result.ir.entities.first_impact
  assert.equal(camera.mode, 'impact')
  assert.deepEqual(camera.attacker, { kind: 'entity', entityKind: 'actor', entityId: 'vanguard', bone: 'hand_l' })
  assert.deepEqual(camera.victim, { kind: 'entity', entityKind: 'actor', entityId: 'raider', bone: 'head' })
  assert.equal(camera.distance, 1.42)
  assert.equal(camera.side, 'right')
  assert.equal(camera.focus, 0.7)
})

test('impact camera requires two actor bone targets', () => {
  const source = exampleForScene('battlefield_attack_response_chain').source.replace(
    '  victim actor raider bone "head"\n',
    ''
  )
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_CAMERA_IMPACT_TARGETS'))
})

test('cinematic camera compiles deterministic shake and roll tracks', () => {
  const example = exampleForScene('forest_tracking_prop_action')
  const result = compileShotDSL(example.source)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.equal(result.ir.scene.style, 'cinematic')
  assert.equal(result.ir.entities.shoulder_follow.shake, 0.014)
  assert.equal(result.ir.entities.low_side.roll, -Math.PI / 180)
  assert.ok(result.ir.tracks.some(track => track.target === 'shoulder_follow.shake'))
})

test('compiler normalizes compatibility styles, action aliases and model presets with warnings', () => {
  const source = exampleForScene('palace_banquet_reaction_chain').source
    .replace('style cinematic', 'style 3d_cinematic_wireframe')
    .replace('model "human-mannequin"', 'model "generic_female"')
    .replace('play 1.55s actor envoy clip "talk"', 'play 1.55s actor envoy clip "speak"')
  const result = compileShotDSL(source)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.equal(result.ir.scene.style, 'cinematic-outline')
  assert.equal(result.ir.entities.ruler.model, 'human-mannequin')
  assert.equal(result.ir.entities.ruler.requestedModel, 'generic_female')
  assert.ok(result.ir.events.some(event => event.type === 'playClip' && event.clip === 'talk' && event.requestedClip === 'speak'))
  assert.ok(result.ir.events.some(event => event.type === 'gaze' && event.actorId === 'ruler' && event.durationMs === 10000))
  assert.ok(result.diagnostics.some(item => item.code === 'W_MODEL_ALIAS' && item.severity === 'warning'))
  assert.ok(result.diagnostics.some(item => item.code === 'W_ACTION_ALIAS' && item.severity === 'warning'))
})

test('compiler rejects actions that the selected model cannot perform', () => {
  const source = exampleForScene('forest_tracking_prop_action').source.replace(
    'play 0s actor scout clip "idle" loop true',
    'play 0s actor scout clip "punch" loop true'
  )
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_MODEL_CLIP' && /game-ready-soldier/.test(item.message)))
})

test('compiler describes dramatic beats and a dependency-ordered professional workflow', () => {
  const example = exampleForScene('noodle_shop_spatial_coverage')
  const result = compileShotDSL(example.source)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.deepEqual(result.ir.beats.order_exchange, {
    id: 'order_exchange',
    fromMs: 4200,
    toMs: 9200,
    intent: '通过正反打和号码牌特写完成点单信息的视觉交接',
    emotion: '短促、明确',
    focus: { kind: 'entity', entityKind: 'object', entityId: 'order_token', bone: null },
    continuity: 'preserve',
    notes: ''
  })
  assert.equal(result.ir.workflow.schemaVersion, 'professional-skill.v1')
  assert.equal(result.ir.workflow.approval, 'manual')
  assert.deepEqual(result.ir.workflow.dispatches.map(item => item.id), [
    'assets', 'staging', 'performance', 'coverage', 'continuity', 'final_qc'
  ])
  assert.equal(result.ir.workflow.dispatches[1].outputs[0].mediaType, 'shotdsl-patch')
  assert.equal(result.ir.workflow.dispatches[1].outputs[0].requiresApproval, true)
  assert.equal(result.ir.workflow.dispatches[4].mode, 'review')
})

test('workflow rejects unknown skills, invalid scopes and dependency cycles', () => {
  const source = exampleForScene('noodle_shop_spatial_coverage').source
    .replace('previs.asset-supervisor as assets scope scene', 'previs.unknown as assets scope actor:missing')
    .replace('mode propose after assets', 'mode propose after coverage')
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_UNKNOWN_SKILL'))
  assert.ok(result.diagnostics.some(item => item.code === 'E_WORKFLOW_SCOPE'))
  assert.ok(result.diagnostics.some(item => item.code === 'E_WORKFLOW_CYCLE'))
})

test('proposal workflows cannot auto-apply patches', () => {
  const source = exampleForScene('noodle_shop_spatial_coverage').source.replace('approval manual', 'approval auto')
  const result = compileShotDSL(source)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some(item => item.code === 'E_WORKFLOW_APPROVAL'))
})
