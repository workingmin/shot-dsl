import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ASSET_ENHANCEMENT_TARGETS,
  CHARACTER_CATALOG,
  getModelAction,
  resolveAction,
  resolveModel,
  resolveStyle
} from './catalog.js'

test('style and action aliases normalize to canonical catalog ids', () => {
  assert.equal(resolveStyle('wireframe').id, 'wireframe')
  assert.equal(resolveStyle('3d_cinematic_wireframe').id, 'cinematic-outline')
  assert.equal(resolveAction('talk').id, 'talk')
  assert.equal(resolveAction('speak').id, 'talk')
  assert.equal(resolveAction('look').id, 'look-around')
})

test('model presets resolve explicitly without pretending to be distinct assets', () => {
  const business = resolveModel('generic_male_business')
  assert.equal(business.id, 'human-mannequin')
  assert.equal(business.alias.support, 'approximate')
  assert.match(business.alias.reason, /wardrobe/i)
})

test('model action capabilities distinguish exact, procedural, approximate and missing support', () => {
  assert.equal(getModelAction('human-mannequin', 'walk').support, 'exact')
  assert.equal(getModelAction('human-mannequin', 'talk').support, 'procedural')
  assert.equal(getModelAction('human-mannequin', 'reach').support, 'approximate')
  assert.equal(getModelAction('game-ready-soldier', 'punch'), null)
})

test('canonical assets and missing casting targets expose auditable data requirements', () => {
  const canonicalModels = Object.values(CHARACTER_CATALOG).filter(model => model.url)
  assert.equal(canonicalModels.length, 3)
  for (const model of canonicalModels) {
    assert.ok(model.source)
    assert.ok(model.license?.id)
    assert.ok(model.profile?.species)
    assert.ok(model.rig?.family)
    assert.ok(Array.isArray(model.speech?.visemes))
  }
  assert.deepEqual(Object.keys(ASSET_ENHANCEMENT_TARGETS).sort(), [
    'business-female-adult',
    'business-male-adult',
    'casual-female-adult',
    'casual-male-teen',
    'traditional-male-older-adult'
  ])
  for (const target of Object.values(ASSET_ENHANCEMENT_TARGETS)) {
    assert.equal(target.status, 'missing')
    assert.ok(target.requiredActions.includes('talk'))
    assert.ok(target.requiredBones.includes('head'))
    assert.ok(target.requiredVisemes.includes('sil'))
  }
})
