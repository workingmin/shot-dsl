import assert from 'node:assert/strict'
import test from 'node:test'

import { createSeededRandom, hashText, normalizeDsl, withSeededRandom } from './stable-random.js'

test('normalizes equivalent DSL text to the same seed input', () => {
  assert.equal(normalizeDsl('  Medium   Single\nEye  '), 'medium single eye')
})

test('generates a repeatable random sequence', () => {
  const first = createSeededRandom(42)
  const second = createSeededRandom(42)
  assert.deepEqual([first(), first(), first()], [second(), second(), second()])
})

test('restores Math.random after rendering', () => {
  const original = Math.random
  const seed = hashText('medium single')
  const sample = withSeededRandom(seed, () => [Math.random(), Math.random()])

  assert.equal(Math.random, original)
  assert.deepEqual(sample, withSeededRandom(seed, () => [Math.random(), Math.random()]))
})
