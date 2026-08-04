import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { CHARACTER_CATALOG } from './character-runtime.js'
import { SUPPORTED_CLIPS } from '../shotdsl/parser.js'

test('default character asset maps every ShotDSL semantic clip', () => {
  const character = CHARACTER_CATALOG['human-mannequin']
  assert.ok(character.url.endsWith('HumanMannequin.glb'))
  assert.equal(character.proportion, 'human-realistic')
  assert.deepEqual(new Set(Object.keys(character.clips)), SUPPORTED_CLIPS)
  assert.deepEqual(character.contacts.punch, {
    impactTimeMs: 292,
    effectorBone: 'hand_l',
    targetBone: 'head',
    responseClip: 'hit-face'
  })
})

test('vendored CC0 human character asset matches its pinned checksum', async () => {
  const asset = await readFile(new URL('../../public/assets/characters/HumanMannequin.glb', import.meta.url))
  const checksum = createHash('sha256').update(asset).digest('hex')
  assert.equal(checksum, 'fdcd24b5006f04dcbbf4e974f2d7257d04fa122261ac0b14990c3625f1a63ff1')
})
