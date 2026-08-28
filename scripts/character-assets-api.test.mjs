import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildProviderPrompt,
  createCharacterAssetService,
  normalizeCharacterPrompt
} from './character-assets-api.mjs'

const validGlb = () => {
  const buffer = Buffer.alloc(12)
  buffer.writeUInt32LE(0x46546c67, 0)
  buffer.writeUInt32LE(2, 4)
  buffer.writeUInt32LE(12, 8)
  return buffer
}

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' }
})

test('character prompts are bounded and expanded for a neutral full-body asset', () => {
  assert.equal(normalizeCharacterPrompt('  成年男性   穿深色夹克  '), '成年男性 穿深色夹克')
  assert.match(buildProviderPrompt('成年男性穿深色夹克'), /Neutral standing A-pose/)
  assert.match(buildProviderPrompt('成年男性穿深色夹克'), /Character description: 成年男性穿深色夹克/)
  assert.throws(() => normalizeCharacterPrompt('短'), /至少需要 5 个字符/)
  assert.throws(() => normalizeCharacterPrompt('x'.repeat(361)), /不能超过 360 个字符/)
})

test('character asset service completes preview, refine, GLB download and reload', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'shotdsl-character-assets-'))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null })
    if (url === 'https://provider.test/openapi/v2/text-to-3d' && options.method === 'POST') {
      return jsonResponse({ result: JSON.parse(options.body).mode === 'preview' ? 'preview-1' : 'refine-1' })
    }
    if (url.endsWith('/preview-1')) return jsonResponse({ status: 'SUCCEEDED', progress: 100 })
    if (url.endsWith('/refine-1')) {
      return jsonResponse({ status: 'SUCCEEDED', progress: 100, model_urls: { glb: 'https://models.test/person.glb' } })
    }
    if (url === 'https://models.test/person.glb') {
      return new Response(validGlb(), { status: 200, headers: { 'Content-Type': 'model/gltf-binary' } })
    }
    return jsonResponse({ message: 'Not found' }, 404)
  }

  const service = await createCharacterAssetService({
    apiKey: 'test-key',
    baseUrl: 'https://provider.test',
    dataDir,
    fetchImpl
  })
  const created = await service.create('成年女性调查员，黑色短发，深绿色工装夹克')
  assert.equal(created.status, 'generating')
  const texturing = await service.get(created.id)
  assert.equal(texturing.status, 'texturing')
  assert.equal(texturing.progress, 45)
  const ready = await service.get(created.id)
  assert.equal(ready.status, 'ready')
  assert.equal(ready.progress, 100)
  assert.equal(ready.modelUrl, `/api/v1/character-assets/${created.id}/model.glb`)

  const model = await service.modelPath(created.id)
  assert.deepEqual(await readFile(model.path), validGlb())
  const previewRequest = calls.find(call => call.body?.mode === 'preview')
  const refineRequest = calls.find(call => call.body?.mode === 'refine')
  assert.match(previewRequest.body.prompt, /深绿色工装夹克/)
  assert.equal(refineRequest.body.preview_task_id, 'preview-1')
  assert.equal(refineRequest.body.enable_pbr, true)

  const restoredService = await createCharacterAssetService({
    apiKey: 'test-key',
    baseUrl: 'https://provider.test',
    dataDir,
    fetchImpl
  })
  const restored = await restoredService.get(created.id)
  assert.equal(restored.status, 'ready')
  assert.equal((await restoredService.modelPath(created.id)).size, 12)
})

test('invalid provider output is rejected instead of published as a character', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'shotdsl-invalid-character-'))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/text-to-3d') && options.method === 'POST') {
      return jsonResponse({ result: JSON.parse(options.body).mode === 'preview' ? 'preview-bad' : 'refine-bad' })
    }
    if (url.endsWith('/preview-bad')) return jsonResponse({ status: 'SUCCEEDED', progress: 100 })
    if (url.endsWith('/refine-bad')) {
      return jsonResponse({ status: 'SUCCEEDED', progress: 100, model_urls: { glb: 'https://models.test/not-a-model.glb' } })
    }
    if (url === 'https://models.test/not-a-model.glb') return new Response('not a glb', { status: 200 })
    return jsonResponse({}, 404)
  }
  const service = await createCharacterAssetService({ apiKey: 'test-key', baseUrl: 'https://provider.test', dataDir, fetchImpl })
  const created = await service.create('成年人物，灰色外套，自然站立')
  await service.get(created.id)
  const failed = await service.get(created.id)
  assert.equal(failed.status, 'failed')
  assert.match(failed.error, /有效 GLB/)
  await assert.rejects(() => service.modelPath(created.id), /尚未就绪/)
})
