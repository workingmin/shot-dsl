import { createIcons, Download, RotateCcw, Sparkles } from 'lucide'
import { CharacterImageRenderer } from './renderer.js'
import { loadCharacterExamples } from './examples.js'

const SAMPLE_MODEL_URL = '/assets/characters/HumanMannequin.glb'
const DRAFT_KEY = 'shotdsl:character-image:draft'
const CUSTOM_EXAMPLE_ID = 'custom'

const elements = {
  form: document.querySelector('#generation-form'),
  example: document.querySelector('#character-example'),
  prompt: document.querySelector('#character-prompt'),
  promptCount: document.querySelector('#prompt-count'),
  providerStatus: document.querySelector('#provider-status'),
  generate: document.querySelector('#generate-button'),
  reset: document.querySelector('#reset-model'),
  jobPanel: document.querySelector('#job-panel'),
  jobStage: document.querySelector('#job-stage'),
  jobProgress: document.querySelector('#job-progress'),
  progress: document.querySelector('#generation-progress'),
  error: document.querySelector('#error-message'),
  modelName: document.querySelector('#model-name'),
  modelSource: document.querySelector('#model-source'),
  modelGeometry: document.querySelector('#model-geometry'),
  modelMaterials: document.querySelector('#model-materials'),
  canvas: document.querySelector('#character-canvas'),
  loading: document.querySelector('#viewer-loading'),
  loadingText: document.querySelector('#viewer-loading-text'),
  viewLabel: document.querySelector('#active-view-label'),
  assetState: document.querySelector('#asset-state'),
  renderStatus: document.querySelector('#render-status'),
  renderStatusText: document.querySelector('#render-status-text'),
  export: document.querySelector('#export-turnaround'),
  viewButtons: [...document.querySelectorAll('[data-view]')]
}

const viewLabels = { free: 'FREE VIEW', front: 'FRONT', left: 'LEFT', back: 'BACK' }
const jobLabels = {
  queued: '任务已提交',
  generating: '正在生成几何',
  texturing: '正在生成写实材质',
  downloading: '正在固定人物资产',
  ready: '人物资产已就绪',
  failed: '人物生成失败'
}

let renderer
let providerConfigured = false
let activeModelUrl = null
let activeModelKind = null
let activeJob = null
let pollRevision = 0
let characterExamples = []
let defaultCharacterExampleId = null

const getCharacterExample = id => characterExamples.find(example => example.id === id) ?? null

const updateExampleQuery = id => {
  const url = new URL(window.location.href)
  if (id === CUSTOM_EXAMPLE_ID) url.searchParams.delete('example')
  else url.searchParams.set('example', id)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

const matchPromptExample = prompt => characterExamples.find(example => example.prompt === prompt) ?? null

const syncExampleSelection = ({ updateUrl = false } = {}) => {
  const example = matchPromptExample(elements.prompt.value)
  const id = example?.id ?? CUSTOM_EXAMPLE_ID
  elements.example.value = id
  if (updateUrl) updateExampleQuery(id)
}

const populateExamples = () => {
  const fragment = document.createDocumentFragment()
  for (const example of characterExamples) {
    const option = document.createElement('option')
    option.value = example.id
    option.textContent = example.label
    fragment.append(option)
  }
  const custom = document.createElement('option')
  custom.value = CUSTOM_EXAMPLE_ID
  custom.textContent = '自定义描述'
  fragment.append(custom)
  elements.example.replaceChildren(fragment)
}

const setRenderStatus = (state, text) => {
  elements.renderStatus.dataset.state = state
  elements.renderStatusText.textContent = text
}

const showError = message => {
  elements.error.textContent = message
  elements.error.hidden = !message
}

const fetchJson = async (url, options) => {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? `请求失败 (${response.status})`)
  return body
}

const renderModelDetails = (name, source, metrics) => {
  elements.modelName.textContent = name
  elements.modelSource.textContent = source
  elements.modelGeometry.textContent = `${metrics.triangles.toLocaleString()} tris · ${metrics.heightM.toFixed(2)} m`
  elements.modelMaterials.textContent = `${metrics.materials} materials · ${metrics.textures} textures`
}

const loadModel = async ({ url, name, source, kind }) => {
  elements.loading.hidden = false
  elements.loadingText.textContent = '正在加载人物'
  elements.export.disabled = true
  showError('')
  setRenderStatus('loading', `正在加载 · ${name}`)
  try {
    const metrics = await renderer.loadModel(url)
    if (!metrics) return
    activeModelUrl = url
    activeModelKind = kind
    renderModelDetails(name, source, metrics)
    elements.assetState.textContent = kind === 'generated' ? 'GENERATED ASSET' : 'SAMPLE ASSET'
    elements.export.disabled = false
    setRenderStatus('ready', `${name} · PBR 材质已加载`)
  } catch (error) {
    showError(error.message)
    setRenderStatus('error', '人物模型加载失败')
    throw error
  } finally {
    elements.loading.hidden = true
  }
}

const loadSample = () => loadModel({
  url: SAMPLE_MODEL_URL,
  name: 'Storyboard Mannequin',
  source: 'CC0 sample GLB',
  kind: 'sample'
})

const updatePrompt = ({ updateUrl = false } = {}) => {
  const value = elements.prompt.value
  elements.promptCount.textContent = `${value.length} / 360`
  localStorage.setItem(DRAFT_KEY, value)
  syncExampleSelection({ updateUrl })
  elements.generate.disabled = !providerConfigured || value.trim().length < 5 || Boolean(activeJob && activeJob.status !== 'ready' && activeJob.status !== 'failed')
}

const updateJob = job => {
  activeJob = job
  elements.jobPanel.hidden = false
  elements.jobStage.textContent = jobLabels[job.status] ?? job.status
  elements.jobProgress.textContent = `${job.progress}%`
  elements.progress.value = job.progress
  updatePrompt()
}

const pollJob = async (id, revision) => {
  while (revision === pollRevision) {
    const job = await fetchJson(`/api/v1/character-assets/${encodeURIComponent(id)}`)
    updateJob(job)
    if (job.status === 'ready') {
      await loadModel({ url: job.modelUrl, name: `Generated ${job.id.slice(0, 8)}`, source: 'Meshy Text to 3D', kind: 'generated' })
      activeJob = null
      updatePrompt()
      return
    }
    if (job.status === 'failed') throw new Error(job.error ?? '人物生成失败')
    await new Promise(resolve => setTimeout(resolve, 1800))
  }
}

const generateCharacter = async () => {
  const prompt = elements.prompt.value.trim()
  const revision = ++pollRevision
  showError('')
  elements.jobPanel.hidden = false
  elements.progress.value = 0
  setRenderStatus('loading', '人物生成任务正在运行')
  try {
    const job = await fetchJson('/api/v1/character-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    })
    updateJob(job)
    await pollJob(job.id, revision)
  } catch (error) {
    activeJob = null
    showError(error.message)
    setRenderStatus('error', '人物生成失败')
    updatePrompt()
  }
}

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

elements.form.addEventListener('submit', event => {
  event.preventDefault()
  if (!elements.generate.disabled) generateCharacter()
})
elements.example.addEventListener('change', () => {
  const example = getCharacterExample(elements.example.value)
  if (!example) return
  elements.prompt.value = example.prompt
  updatePrompt({ updateUrl: true })
  elements.prompt.focus()
})
elements.prompt.addEventListener('input', () => updatePrompt({ updateUrl: true }))
elements.reset.addEventListener('click', () => {
  pollRevision += 1
  activeJob = null
  elements.jobPanel.hidden = true
  updatePrompt()
  loadSample()
})
for (const button of elements.viewButtons) {
  button.addEventListener('click', () => {
    const view = button.dataset.view
    renderer.setView(view, view === 'free')
    elements.viewLabel.textContent = viewLabels[view]
    for (const item of elements.viewButtons) item.setAttribute('aria-pressed', String(item === button))
  })
}
elements.export.addEventListener('click', async () => {
  if (elements.export.disabled) return
  elements.export.disabled = true
  setRenderStatus('loading', '正在渲染三视图')
  try {
    const blob = await renderer.exportTurnaround()
    downloadBlob(blob, `character-${activeModelKind ?? 'asset'}-turnaround.png`)
    setRenderStatus('ready', `三视图已导出 · ${(blob.size / 1024).toFixed(0)} KB`)
  } catch (error) {
    showError(error.message)
    setRenderStatus('error', '三视图导出失败')
  } finally {
    elements.export.disabled = false
  }
})

window.__CHARACTER_IMAGE_APP__ = {
  getState: () => ({
    ...renderer?.getState(),
    providerConfigured,
    modelUrl: activeModelUrl,
    modelKind: activeModelKind,
    job: activeJob ? { id: activeJob.id, status: activeJob.status, progress: activeJob.progress } : null
  }),
  exportTurnaround: async () => (await renderer.exportTurnaround(512)).size
}

const initialize = async () => {
  createIcons({ icons: { Download, RotateCcw, Sparkles }, attrs: { 'stroke-width': 1.8 } })
  const catalog = await loadCharacterExamples()
  characterExamples = catalog.examples
  defaultCharacterExampleId = catalog.defaultExampleId
  populateExamples()
  const requestedExample = getCharacterExample(new URLSearchParams(window.location.search).get('example'))
  const defaultExample = getCharacterExample(defaultCharacterExampleId)
  elements.prompt.value = requestedExample?.prompt ?? localStorage.getItem(DRAFT_KEY) ?? defaultExample.prompt
  updatePrompt()
  renderer = new CharacterImageRenderer(elements.canvas)
  await loadSample()
  try {
    const provider = await fetchJson('/api/v1/character-assets/provider')
    providerConfigured = provider.configured
    elements.providerStatus.dataset.state = providerConfigured ? 'ready' : 'error'
    elements.providerStatus.textContent = providerConfigured ? 'Meshy 已连接' : '未配置 MESHY_API_KEY'
  } catch {
    providerConfigured = false
    elements.providerStatus.dataset.state = 'error'
    elements.providerStatus.textContent = '生成服务不可用'
  }
  updatePrompt()
}

initialize().catch(error => {
  elements.loading.hidden = true
  showError(error.message)
  setRenderStatus('error', '人物模块初始化失败')
  console.error(error)
})
