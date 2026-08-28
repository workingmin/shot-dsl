import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { CHARACTER_CATALOG } from './character-runtime.js'
import { SUPPORTED_CLIPS } from '../shotdsl/parser.js'

test('storyboard proxy maps every supported semantic action', () => {
  const character = CHARACTER_CATALOG['storyboard-mannequin']
  assert.ok(character.url.endsWith('HumanMannequin.glb'))
  assert.equal(character.proportion, 'human-neutral')
  assert.equal(character.fidelity, 'storyboard-proxy')
  assert.deepEqual(new Set(Object.keys(character.clips)), SUPPORTED_CLIPS)
  assert.equal(character.clips.walk, 'Walk')
  assert.equal(character.clips.run, 'Sprint')
  assert.equal(character.bones.hand_r, 'hand_r')
})

test('vendored CC0 storyboard proxy matches its pinned checksum', async () => {
  const asset = await readFile(new URL('../../public/assets/characters/HumanMannequin.glb', import.meta.url))
  const checksum = createHash('sha256').update(asset).digest('hex')
  assert.equal(checksum, 'fdcd24b5006f04dcbbf4e974f2d7257d04fa122261ac0b14990c3625f1a63ff1')
})
