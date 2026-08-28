import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTION_CATALOG,
  CHARACTER_CATALOG,
  STYLE_CATALOG,
  getModelAction,
  resolveAction,
  resolveModel,
  resolveStyle
} from './catalog.js'

test('catalog exposes one black-and-white storyboard render pipeline', () => {
  assert.deepEqual(Object.keys(STYLE_CATALOG), ['storyboard'])
  assert.equal(resolveStyle('storyboard').id, 'storyboard')
  assert.equal(resolveStyle('rough-ink').id, 'storyboard')
  assert.equal(resolveStyle('cinematic'), null)
  assert.equal(resolveStyle('wireframe'), null)
})

test('catalog is limited to storyboard actions and one neutral proxy', () => {
  assert.deepEqual(Object.keys(ACTION_CATALOG), [
    'idle', 'walk', 'run', 'crouch', 'talk', 'reach', 'look-around', 'fall'
  ])
  assert.equal(CHARACTER_CATALOG['storyboard-mannequin'].fidelity, 'storyboard-proxy')
  assert.equal(resolveModel('human-mannequin').id, 'storyboard-mannequin')
  assert.equal(resolveAction('walking').id, 'walk')
  assert.equal(resolveAction('punch'), null)
})

test('model action mappings distinguish exact and procedural support', () => {
  assert.equal(getModelAction('storyboard-mannequin', 'walk').support, 'exact')
  assert.equal(getModelAction('storyboard-mannequin', 'talk').support, 'procedural')
  assert.equal(getModelAction('storyboard-mannequin', 'reach').support, 'procedural')
  assert.equal(getModelAction('storyboard-mannequin', 'punch'), null)
})
