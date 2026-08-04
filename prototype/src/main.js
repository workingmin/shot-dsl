import ShotTemplateSystem from '../upstream/src/js/shot-template-system/index.js'

import { hashText, normalizeDsl, withSeededRandom } from './stable-random.js'

const DEFAULT_DSL = 'medium single dead center eye medium lens male stand light outside'
const RENDER_DEBOUNCE_MS = 180
const ASSET_TIMEOUT_MS = 20000

const examples = [
  {
    label: '标准中景',
    value: DEFAULT_DSL
  },
  {
    label: '低机位过肩',
    value: 'medium ots left low wide lens male cautious dim medium room'
  },
  {
    label: '女性近景',
    value: 'close up single right eye long lens female looking left light small room'
  },
  {
    label: '高位群像',
    value: 'long shot group left high ultra wide lens boxmodel stand light auditorium'
  },
  {
    label: '背光全景',
    value: 'full single centered eye wide lens male wide stance backlit outside'
  }
]

const elements = {
  input: document.querySelector('#dsl-input'),
  clearButton: document.querySelector('#clear-button'),
  characterCount: document.querySelector('#character-count'),
  examples: document.querySelector('#examples'),
  preview: document.querySelector('#preview'),
  loadingView: document.querySelector('#loading-view'),
  params: document.querySelector('#parsed-params'),
  renderTime: document.querySelector('#render-time'),
  seedLabel: document.querySelector('#seed-label'),
  status: document.querySelector('#status'),
  statusText: document.querySelector('#status-text')
}

let renderTimer
let shotTemplateSystem

const setStatus = (state, message) => {
  elements.status.dataset.state = state
  elements.statusText.textContent = message
}

const setParsedParams = params => {
  elements.params.replaceChildren()

  if (!params || Object.keys(params).length === 0) {
    const empty = document.createElement('span')
    empty.className = 'empty-state'
    empty.textContent = '输入镜头描述后显示参数'
    elements.params.append(empty)
    return
  }

  for (const [key, value] of Object.entries(params)) {
    const item = document.createElement('span')
    item.className = 'param'

    const name = document.createElement('span')
    name.className = 'param-key'
    name.textContent = key

    const parsedValue = document.createElement('span')
    parsedValue.textContent = value

    item.append(name, parsedValue)
    elements.params.append(item)
  }
}

const showError = error => {
  console.error(error)
  setStatus('error', '渲染失败')
  elements.params.replaceChildren()
  const message = document.createElement('span')
  message.className = 'error-message'
  message.textContent = error instanceof Error ? error.message : String(error)
  elements.params.append(message)
}

const render = () => {
  const normalizedDsl = normalizeDsl(elements.input.value)
  elements.characterCount.textContent = `${elements.input.value.length} chars`

  if (!normalizedDsl || !shotTemplateSystem?.isReady()) {
    setParsedParams(null)
    elements.seedLabel.textContent = 'seed —'
    elements.renderTime.textContent = '—'
    return
  }

  const seed = hashText(normalizedDsl)
  const startedAt = performance.now()

  try {
    const parsed = shotTemplateSystem.parseParamsText(normalizedDsl)
    const result = withSeededRandom(seed, () => shotTemplateSystem.renderShot(parsed))

    if (!result.canvas.isConnected) {
      elements.loadingView?.remove()
      elements.preview.append(result.canvas)
    }

    setParsedParams(result.shotParams)
    elements.seedLabel.textContent = `seed ${seed.toString(16).padStart(8, '0')}`
    elements.renderTime.textContent = `${Math.round(performance.now() - startedAt)} ms`
    setStatus('ready', '实时预览已就绪')
  } catch (error) {
    showError(error)
  }
}

const scheduleRender = () => {
  window.clearTimeout(renderTimer)
  renderTimer = window.setTimeout(render, RENDER_DEBOUNCE_MS)
}

const renderExamples = () => {
  for (const example of examples) {
    const button = document.createElement('button')
    button.className = 'example-chip'
    button.type = 'button'
    button.textContent = example.label
    button.title = example.value
    button.addEventListener('click', () => {
      elements.input.value = example.value
      render()
      elements.input.focus()
    })
    elements.examples.append(button)
  }
}

const waitUntilReady = instance => new Promise((resolve, reject) => {
  const startedAt = performance.now()
  const check = () => {
    if (instance.isReady()) {
      resolve()
      return
    }

    if (performance.now() - startedAt > ASSET_TIMEOUT_MS) {
      const failedAssets = instance.getAssetLoadErrors()
      const suffix = failedAssets.length > 0 ? `：${failedAssets.join(', ')}` : ''
      reject(new Error(`Storyboarder 资产加载超时${suffix}`))
      return
    }

    window.setTimeout(check, 80)
  }
  check()
})

const start = async () => {
  renderExamples()
  setParsedParams(null)
  elements.input.value = DEFAULT_DSL
  elements.characterCount.textContent = `${DEFAULT_DSL.length} chars`

  elements.input.addEventListener('input', scheduleRender)
  elements.clearButton.addEventListener('click', () => {
    elements.input.value = ''
    render()
    elements.input.focus()
  })

  try {
    shotTemplateSystem = new ShotTemplateSystem({ width: 960, height: 540 })
    if (!shotTemplateSystem.isEnabled()) {
      throw new Error('当前浏览器或显卡不支持 WebGL')
    }
    await waitUntilReady(shotTemplateSystem)
    render()
  } catch (error) {
    elements.loadingView?.remove()
    showError(error)
  }
}

start()
