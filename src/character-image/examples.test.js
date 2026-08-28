import test from 'node:test'
import assert from 'node:assert/strict'
import { readCharacterImageExamples } from '../../scripts/example-files.mjs'

const catalog = await readCharacterImageExamples()

test('character-image directory contains stable unique example files and prompts', () => {
  assert.equal(catalog.examples.length, 5)
  assert.equal(new Set(catalog.examples.map(example => example.id)).size, catalog.examples.length)
  assert.ok(catalog.examples.every(example => /^[a-z0-9_]+$/.test(example.id)))
  assert.ok(catalog.examples.every(example => example.file.endsWith('.txt')))
  assert.ok(catalog.examples.every(example => example.prompt.length >= 5 && example.prompt.length <= 360))
})

test('character-image manifest points to a valid default example', () => {
  assert.ok(catalog.examples.some(example => example.id === catalog.defaultExampleId))
})
