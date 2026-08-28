import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHARACTER_EXAMPLES,
  DEFAULT_CHARACTER_EXAMPLE_ID,
  getCharacterExample
} from './examples.js'

test('character examples have stable unique ids and bounded generation prompts', () => {
  assert.equal(CHARACTER_EXAMPLES.length, 5)
  assert.equal(new Set(CHARACTER_EXAMPLES.map(example => example.id)).size, CHARACTER_EXAMPLES.length)
  assert.ok(CHARACTER_EXAMPLES.every(example => /^[a-z0-9_]+$/.test(example.id)))
  assert.ok(CHARACTER_EXAMPLES.every(example => example.label.length > 1))
  assert.ok(CHARACTER_EXAMPLES.every(example => example.prompt.length >= 5 && example.prompt.length <= 360))
})

test('character examples expose a valid default and reject unknown ids', () => {
  assert.equal(getCharacterExample(DEFAULT_CHARACTER_EXAMPLE_ID)?.id, DEFAULT_CHARACTER_EXAMPLE_ID)
  assert.equal(getCharacterExample('missing'), null)
})
