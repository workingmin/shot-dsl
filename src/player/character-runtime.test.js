import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import {
  applyStoryboardMaterialOverride,
  CHARACTER_CATALOG,
  cloneCharacterMaterial
} from './character-runtime.js'
import { SUPPORTED_CLIPS } from '../shotdsl/parser.js'

test('character materials preserve original PBR skin and wardrobe appearance', () => {
  const colorMap = new THREE.Texture()
  const normalMap = new THREE.Texture()
  const source = new THREE.MeshStandardMaterial({
    color: '#b87558',
    map: colorMap,
    normalMap,
    roughness: 0.46,
    metalness: 0.08
  })

  const material = cloneCharacterMaterial(source)
  assert.notEqual(material, source)
  assert.equal(material.color.getHex(), source.color.getHex())
  assert.equal(material.map, colorMap)
  assert.equal(material.normalMap, normalMap)
  assert.equal(material.roughness, 0.46)
  assert.equal(material.metalness, 0.08)

  const model = new THREE.Group()
  model.add(new THREE.Mesh(new THREE.BoxGeometry(), material))
  applyStoryboardMaterialOverride(model)
  assert.equal(material.color.getHexString(), 'e8e8e3')
  assert.equal(material.map, null)
  assert.equal(material.normalMap, null)
  assert.equal(material.roughness, 1)
  assert.equal(material.metalness, 0)

  source.dispose()
  material.dispose()
  colorMap.dispose()
  normalMap.dispose()
  model.children[0].geometry.dispose()
})

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
