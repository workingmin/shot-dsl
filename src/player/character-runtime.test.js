import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { CHARACTER_CATALOG } from './character-runtime.js'
import { SUPPORTED_CLIPS } from '../shotdsl/parser.js'

test('default character asset maps every ShotDSL semantic clip', () => {
  const character = CHARACTER_CATALOG['robot-expressive']
  assert.ok(character.url.endsWith('RobotExpressive.glb'))
  assert.deepEqual(new Set(Object.keys(character.clips)), SUPPORTED_CLIPS)
})

test('vendored CC0 character asset matches its pinned checksum', async () => {
  const asset = await readFile(new URL('../../public/assets/characters/RobotExpressive.glb', import.meta.url))
  const checksum = createHash('sha256').update(asset).digest('hex')
  assert.equal(checksum, '047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319')
})
