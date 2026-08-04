import { EXAMPLES } from './examples.js'
import { ShotPlayer } from './player/player.js'
import { compileShotDSL } from './shotdsl/parser.js'

const elements = {
  status: document.querySelector('#status'),
  statusText: document.querySelector('#status-text'),
  input: document.querySelector('#dsl-input'),
  count: document.querySelector('#character-count'),
  clear: document.querySelector('#clear-button'),
  examples: document.querySelector('#examples'),
  diagnostics: document.querySelector('#diagnostics'),
  diagnosticCount: document.querySelector('#diagnostic-count'),
  canvas: document.querySelector('#scene-canvas'),
  loading: document.querySelector('#loading-view'),
  play: document.querySelector('#play-button'),
  restart: document.querySelector('#restart-button'),
  timeline: document.querySelector('#timeline'),
  currentTime: document.querySelector('#current-time'),
  duration: document.querySelector('#duration'),
  export: document.querySelector('#export-button'),
  eventTrack: document.querySelector('#event-track'),
  frameLabel: document.querySelector('#frame-label'),
  shotLabel: document.querySelector('#shot-label'),
  renderStats: document.querySelector('#render-stats'),
  ir: document.querySelector('#scene-ir'),
  irSummary: document.querySelector('#ir-summary')
}

let player
let activeIr = null
let currentTimeMs = 0
let playing = false
let animationFrame = null
let playbackStartTimestamp = null
let playbackStartTime = 0
let compileTimer = null
let compileRevision = 0
let activeExample = EXAMPLES[0].id
let playhead = null

const formatTime = milliseconds => {
  const total = Math.max(0, Math.round(milliseconds))
  const minutes = Math.floor(total / 60000).toString().padStart(2, '0')
  const seconds = Math.floor(total % 60000 / 1000).toString().padStart(2, '0')
  const millis = (total % 1000).toString().padStart(3, '0')
  return `${minutes}:${seconds}.${millis}`
}

const setStatus = (state, text) => {
  elements.status.dataset.state = state
  elements.statusText.textContent = text
}

const setPlaying = value => {
  playing = value
  elements.play.textContent = playing ? 'Ⅱ' : '▶'
  elements.play.setAttribute('aria-label', playing ? '暂停' : '播放')
  if (!playing && animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = null
  playbackStartTimestamp = null
  playbackStartTime = currentTimeMs
  if (playing) animationFrame = requestAnimationFrame(tick)
}

const updateTimeUI = () => {
  if (!activeIr) return
  elements.timeline.value = String(Math.round(currentTimeMs))
  elements.currentTime.textContent = formatTime(currentTimeMs)
  elements.frameLabel.textContent = `F ${Math.floor(currentTimeMs / 1000 * activeIr.scene.fps).toString().padStart(3, '0')}`
  if (playhead) playhead.style.left = `${currentTimeMs / activeIr.scene.durationMs * 100}%`
}

const seek = milliseconds => {
  if (!activeIr) return
  currentTimeMs = Math.max(0, Math.min(activeIr.scene.durationMs, milliseconds))
  player.seek(currentTimeMs)
  updateTimeUI()
  const stats = player.getStats()
  elements.renderStats.textContent = `${stats.skinnedActors} rigged · ${stats.entities} objects · ${stats.triangles.toLocaleString()} tris`
}

function tick(timestamp) {
  if (!playing || !activeIr) return
  if (playbackStartTimestamp === null) playbackStartTimestamp = timestamp
  const next = playbackStartTime + timestamp - playbackStartTimestamp
  if (next >= activeIr.scene.durationMs) {
    seek(activeIr.scene.durationMs)
    setPlaying(false)
    return
  }
  seek(next)
  animationFrame = requestAnimationFrame(tick)
}

const renderDiagnostics = diagnostics => {
  elements.diagnostics.replaceChildren()
  elements.diagnosticCount.textContent = diagnostics.length ? `${diagnostics.length} error${diagnostics.length === 1 ? '' : 's'}` : '0 errors'
  if (diagnostics.length === 0) {
    const ok = document.createElement('div')
    ok.className = 'diagnostic-ok'
    ok.textContent = '✓ ShotDSL 编译通过，可以播放与拖拽。'
    elements.diagnostics.append(ok)
    return
  }
  for (const item of diagnostics) {
    const row = document.createElement('div')
    row.className = 'diagnostic'
    const code = document.createElement('span')
    code.className = 'diagnostic-code'
    code.textContent = `${item.code} · L${item.line}`
    const message = document.createElement('span')
    message.textContent = item.message
    row.append(code, message)
    elements.diagnostics.append(row)
  }
}

const renderEventTrack = ir => {
  elements.eventTrack.replaceChildren()
  for (const event of ir.events) {
    const marker = document.createElement('span')
    marker.className = `event-marker ${event.type === 'cameraCut' ? 'cut-event' : 'play-event'}`
    marker.style.left = `${event.timeMs / ir.scene.durationMs * 100}%`
    marker.dataset.label = event.type === 'cameraCut' ? `CUT ${event.cameraId}` : `${event.actorId}:${event.clip}`
    marker.title = `${formatTime(event.timeMs)} · ${marker.dataset.label}`
    elements.eventTrack.append(marker)
  }
  playhead = document.createElement('span')
  playhead.className = 'playhead'
  elements.eventTrack.append(playhead)
}

const compile = async () => {
  const revision = ++compileRevision
  const started = performance.now()
  const result = compileShotDSL(elements.input.value)
  elements.count.textContent = `${elements.input.value.length} chars`
  renderDiagnostics(result.diagnostics)
  if (!result.ok) {
    player.cancelPendingLoad()
    setPlaying(false)
    elements.loading.hidden = true
    setStatus('error', `编译失败 · ${result.diagnostics.length} 个问题`)
    return
  }

  setPlaying(false)
  elements.loading.hidden = false
  setStatus('loading', '正在加载蒙皮人物与动作…')
  const loaded = await player.load(result.ir)
  if (!loaded || revision !== compileRevision) return
  activeIr = result.ir
  currentTimeMs = 0
  elements.timeline.max = String(activeIr.scene.durationMs)
  elements.duration.textContent = formatTime(activeIr.scene.durationMs)
  elements.ir.textContent = JSON.stringify(activeIr, null, 2)
  elements.irSummary.textContent = `${Object.keys(activeIr.entities).length} entities · ${activeIr.tracks.length} tracks · ${activeIr.events.length} events`
  renderEventTrack(activeIr)
  seek(0)
  elements.loading.hidden = true
  const warning = player.assetWarnings.length ? ` · ${player.assetWarnings.length} fallback` : ''
  setStatus('ready', `骨骼动画就绪 · ${(performance.now() - started).toFixed(1)} ms${warning}`)
  window.__SHOT_DSL_APP__.compileCount += 1
}

const scheduleCompile = () => {
  clearTimeout(compileTimer)
  elements.count.textContent = `${elements.input.value.length} chars`
  setStatus('loading', '等待重新编译…')
  compileTimer = setTimeout(compile, 240)
}

const selectExample = example => {
  activeExample = example.id
  elements.input.value = example.source
  for (const button of elements.examples.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === activeExample))
  setPlaying(false)
  compile()
}

for (const example of EXAMPLES) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-chip'
  button.dataset.id = example.id
  button.textContent = example.label
  button.setAttribute('aria-pressed', String(example.id === activeExample))
  button.addEventListener('click', () => selectExample(example))
  elements.examples.append(button)
}

elements.input.addEventListener('input', scheduleCompile)
elements.input.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); clearTimeout(compileTimer); compile() }
  if (event.key === 'Tab') {
    event.preventDefault()
    const start = elements.input.selectionStart
    elements.input.setRangeText('  ', start, elements.input.selectionEnd, 'end')
    scheduleCompile()
  }
})
elements.clear.addEventListener('click', () => { elements.input.value = ''; scheduleCompile(); elements.input.focus() })
elements.play.addEventListener('click', () => {
  if (!activeIr) return
  if (!playing && currentTimeMs >= activeIr.scene.durationMs) seek(0)
  setPlaying(!playing)
})
elements.restart.addEventListener('click', () => { setPlaying(false); seek(0) })
elements.timeline.addEventListener('input', () => { setPlaying(false); seek(Number(elements.timeline.value)) })
elements.export.addEventListener('click', async () => {
  if (!activeIr) return
  const blob = await player.exportFrame()
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = `${activeIr.scene.id}-${Math.round(currentTimeMs)}ms.png`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

window.__SHOT_DSL_APP__ = {
  compileCount: 0,
  getState: () => ({
    ready: Boolean(activeIr),
    playing,
    currentTimeMs,
    sceneId: activeIr?.scene.id ?? null,
    entityCount: activeIr ? Object.keys(activeIr.entities).length : 0,
    camera: player?.activeCamera?.name ?? null,
    skinnedActors: player?.getStats?.().skinnedActors ?? 0,
    fallbackActors: player?.getStats?.().fallbackActors ?? 0
  })
}

try {
  player = new ShotPlayer(elements.canvas)
  player.onCameraChange = cameraName => { elements.shotLabel.textContent = `CAM ${cameraName.toUpperCase()}` }
  selectExample(EXAMPLES[0])
} catch (error) {
  elements.loading.hidden = true
  renderDiagnostics([{ code: 'E_WEBGL', message: error.message, line: 1 }])
  setStatus('error', 'WebGL 初始化失败')
  console.error(error)
}
