import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

const MAX_BODY_BYTES = 64 * 1024
const MAX_MODEL_BYTES = 80 * 1024 * 1024
const GLB_MAGIC = 0x46546c67

class ApiError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.statusCode = statusCode
  }
}

export const normalizeCharacterPrompt = value => {
  if (typeof value !== 'string') throw new ApiError('人物描述必须是字符串', 400)
  const prompt = value.trim().replace(/\s+/g, ' ')
  if (prompt.length < 5) throw new ApiError('人物描述至少需要 5 个字符', 400)
  if (prompt.length > 360) throw new ApiError('人物描述不能超过 360 个字符', 400)
  return prompt
}

export const buildProviderPrompt = prompt => [
  'Realistic full-body 3D human character.',
  'Neutral standing A-pose, arms slightly away from the torso, feet visible and parallel.',
  'Anatomically coherent adult proportions, complete body, realistic skin and clothing materials.',
  'Single person only, no props, no pedestal, no environment, no text.',
  `Character description: ${prompt}`
].join(' ')

const publicJob = job => ({
  id: job.id,
  prompt: job.prompt,
  status: job.status,
  progress: job.progress,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  ...(job.status === 'ready' ? { modelUrl: `/api/v1/character-assets/${job.id}/model.glb` } : {}),
  ...(job.error ? { error: job.error } : {})
})

const providerErrorMessage = body => body?.task_error?.message || body?.error?.message || body?.message || '生成服务请求失败'

export const createCharacterAssetService = async ({
  apiKey = process.env.MESHY_API_KEY,
  baseUrl = process.env.MESHY_API_BASE_URL ?? 'https://api.meshy.ai',
  dataDir,
  fetchImpl = fetch
}) => {
  const metadataDirectory = join(dataDir, 'jobs')
  const modelDirectory = join(dataDir, 'models')
  await Promise.all([
    mkdir(metadataDirectory, { recursive: true }),
    mkdir(modelDirectory, { recursive: true })
  ])

  const jobs = new Map()
  for (const filename of await readdir(metadataDirectory).catch(() => [])) {
    if (!filename.endsWith('.json')) continue
    try {
      const job = JSON.parse(await readFile(join(metadataDirectory, filename), 'utf8'))
      if (job?.id && job?.prompt && job?.stage) jobs.set(job.id, job)
    } catch { /* Ignore incomplete metadata from an interrupted write. */ }
  }

  const persist = async job => {
    job.updatedAt = new Date().toISOString()
    const { refreshPromise, ...snapshot } = job
    const path = join(metadataDirectory, `${job.id}.json`)
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`)
    await rename(temporaryPath, path)
  }

  const providerRequest = async (path, options = {}) => {
    if (!apiKey) throw new ApiError('服务端未配置 MESHY_API_KEY', 503)
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new ApiError(providerErrorMessage(body), response.status >= 500 ? 502 : response.status)
    return body
  }

  const failJob = async (job, message) => {
    job.status = 'failed'
    job.error = message || '人物生成失败'
    await persist(job)
  }

  const downloadModel = async (job, modelUrl) => {
    const response = await fetchImpl(modelUrl)
    if (!response.ok) throw new ApiError(`人物模型下载失败 (${response.status})`, 502)
    const declaredSize = Number(response.headers.get('content-length') ?? 0)
    if (declaredSize > MAX_MODEL_BYTES) throw new ApiError('人物模型超过 80 MB 限制', 422)
    const model = Buffer.from(await response.arrayBuffer())
    if (model.byteLength > MAX_MODEL_BYTES) throw new ApiError('人物模型超过 80 MB 限制', 422)
    if (model.byteLength < 12 || model.readUInt32LE(0) !== GLB_MAGIC) throw new ApiError('生成结果不是有效 GLB 文件', 422)
    const target = join(modelDirectory, `${job.id}.glb`)
    const temporaryTarget = `${target}.${randomUUID()}.tmp`
    await writeFile(temporaryTarget, model)
    await rename(temporaryTarget, target)
    job.modelFile = `${job.id}.glb`
  }

  const startRefine = async job => {
    const response = await providerRequest('/openapi/v2/text-to-3d', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'refine',
        preview_task_id: job.providerTaskId,
        texture_prompt: `${job.prompt}. Realistic human skin, hair and fabric colors with neutral studio lighting.`,
        enable_pbr: true,
        remove_lighting: true,
        target_formats: ['glb'],
        auto_size: true,
        moderation: true
      })
    })
    if (!response.result) throw new ApiError('生成服务未返回材质任务 ID', 502)
    job.stage = 'refine'
    job.status = 'texturing'
    job.progress = 45
    job.providerTaskId = response.result
    await persist(job)
  }

  const refreshJob = async job => {
    const task = await providerRequest(`/openapi/v2/text-to-3d/${encodeURIComponent(job.providerTaskId)}`)
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      await failJob(job, providerErrorMessage(task))
      return
    }
    const providerProgress = Math.max(0, Math.min(100, Number(task.progress ?? 0)))
    if (job.stage === 'preview') {
      job.status = 'generating'
      job.progress = Math.max(2, Math.min(44, Math.round(providerProgress * 0.44)))
      if (task.status === 'SUCCEEDED') await startRefine(job)
      else await persist(job)
      return
    }
    if (job.stage === 'refine') {
      job.status = 'texturing'
      job.progress = Math.max(45, Math.min(90, 45 + Math.round(providerProgress * 0.45)))
      if (task.status !== 'SUCCEEDED') {
        await persist(job)
        return
      }
      const modelUrl = task.model_urls?.glb
      if (!modelUrl) {
        await failJob(job, '生成服务未返回 GLB 人物模型')
        return
      }
      job.status = 'downloading'
      job.progress = 94
      await persist(job)
      try {
        await downloadModel(job, modelUrl)
        job.stage = 'ready'
        job.status = 'ready'
        job.progress = 100
        await persist(job)
      } catch (error) {
        await failJob(job, error.message)
      }
    }
  }

  const create = async value => {
    if (!apiKey) throw new ApiError('服务端未配置 MESHY_API_KEY', 503)
    const prompt = normalizeCharacterPrompt(value)
    const response = await providerRequest('/openapi/v2/text-to-3d', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'preview',
        prompt: buildProviderPrompt(prompt),
        target_formats: ['glb'],
        auto_size: true,
        moderation: true
      })
    })
    if (!response.result) throw new ApiError('生成服务未返回任务 ID', 502)
    const timestamp = new Date().toISOString()
    const job = {
      id: randomUUID(),
      prompt,
      stage: 'preview',
      status: 'generating',
      progress: 1,
      providerTaskId: response.result,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    jobs.set(job.id, job)
    await persist(job)
    return publicJob(job)
  }

  const get = async id => {
    const job = jobs.get(id)
    if (!job) throw new ApiError('人物生成任务不存在', 404)
    if (!['ready', 'failed'].includes(job.status)) {
      if (!job.refreshPromise) {
        job.refreshPromise = refreshJob(job).finally(() => { delete job.refreshPromise })
      }
      await job.refreshPromise
    }
    return publicJob(job)
  }

  const modelPath = async id => {
    const job = jobs.get(id)
    if (!job || job.status !== 'ready' || !job.modelFile) throw new ApiError('人物模型尚未就绪', 404)
    const path = join(modelDirectory, job.modelFile)
    const metadata = await stat(path).catch(() => null)
    if (!metadata?.isFile()) throw new ApiError('人物模型文件不存在', 404)
    return { path, size: metadata.size }
  }

  return {
    configured: Boolean(apiKey),
    create,
    get,
    modelPath
  }
}

const readJsonBody = async request => {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new ApiError('请求内容超过 64 KB 限制', 413)
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ApiError('请求内容必须是有效 JSON', 400)
  }
}

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

export const createCharacterAssetsApi = async options => {
  const service = await createCharacterAssetService(options)
  return async (request, response, url) => {
    const { pathname } = url
    if (!pathname.startsWith('/api/v1/character-assets')) return false
    try {
      if (pathname === '/api/v1/character-assets/provider' && request.method === 'GET') {
        sendJson(response, 200, { provider: 'meshy', configured: service.configured })
        return true
      }
      if (pathname === '/api/v1/character-assets' && request.method === 'POST') {
        const body = await readJsonBody(request)
        sendJson(response, 202, await service.create(body.prompt))
        return true
      }
      const modelMatch = pathname.match(/^\/api\/v1\/character-assets\/([0-9a-f-]+)\/model\.glb$/i)
      if (modelMatch && request.method === 'GET') {
        const model = await service.modelPath(modelMatch[1])
        response.writeHead(200, {
          'Content-Type': 'model/gltf-binary',
          'Content-Length': model.size,
          'Cache-Control': 'public, max-age=31536000, immutable'
        })
        createReadStream(model.path).pipe(response)
        return true
      }
      const jobMatch = pathname.match(/^\/api\/v1\/character-assets\/([0-9a-f-]+)$/i)
      if (jobMatch && request.method === 'GET') {
        sendJson(response, 200, await service.get(jobMatch[1]))
        return true
      }
      sendJson(response, 404, { error: 'API endpoint not found' })
    } catch (error) {
      sendJson(response, error.statusCode ?? 500, { error: error.message ?? '服务器内部错误' })
    }
    return true
  }
}
