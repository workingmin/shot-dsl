import test from 'node:test'
import assert from 'node:assert/strict'
import {
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
