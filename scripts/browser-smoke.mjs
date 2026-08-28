import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const debugPort = Number(process.env.DEBUG_PORT ?? 9223)
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:4173'
const windowSize = process.env.WINDOW_SIZE ?? '1500,1050'
const minimumCanvasWidth = Number(process.env.MIN_CANVAS_WIDTH ?? 500)

const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--use-angle=swiftshader',
  `--remote-debugging-port=${debugPort}`,
  `--window-size=${windowSize}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'ignore'] })

const waitForPageTarget = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
      const page = targets.find(target => target.type === 'page')
      if (page) return page
    } catch { /* Chrome is starting. */ }
    await delay(100)
  }
  throw new Error('Chrome DevTools endpoint did not become ready')
}

const run = async () => {
  const target = await waitForPageTarget()
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  const pending = new Map()
  const diagnostics = []
  const requestUrls = new Map()
  let sequence = 0

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
      return
    }
    if (message.method === 'Network.requestWillBeSent') requestUrls.set(message.params.requestId, message.params.request.url)
    if (message.method === 'Runtime.exceptionThrown') diagnostics.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
    if (message.method === 'Network.loadingFailed' && message.params.errorText !== 'net::ERR_ABORTED') {
      diagnostics.push(`${message.params.errorText}: ${message.params.type}: ${requestUrls.get(message.params.requestId) ?? 'unknown URL'}`)
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      diagnostics.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '))
    }
  })

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    sequence += 1
    pending.set(sequence, { resolve, reject })
    socket.send(JSON.stringify({ id: sequence, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  const waitFor = async (expression, attempts = 100) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const value = await evaluate(expression)
      if (value) return value
      await delay(100)
    }
    throw new Error(`Timed out waiting for: ${expression}`)
  }
  const selectExample = label => evaluate(`(() => {
    const select = document.querySelector('#scene-example')
    const option = [...select.options].find(item => item.textContent === ${JSON.stringify(label)})
    if (!option) throw new Error('Unknown scene example: ' + ${JSON.stringify(label)})
    select.value = option.value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  const seek = milliseconds => evaluate(`(() => {
    const range = document.querySelector('#timeline')
    range.value = '${milliseconds}'
    range.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)

  await Promise.all([send('Runtime.enable'), send('Network.enable'), send('Page.enable')])
  await send('Page.navigate', { url: appUrl })
  await waitFor(`document.querySelector('#status')?.dataset.state === 'ready'`)

  const initial = JSON.parse(await evaluate(`JSON.stringify({
    app: window.__SHOT_DSL_APP__?.getState(),
    canvas: { width: document.querySelector('canvas')?.width, height: document.querySelector('canvas')?.height },
    loadingDisplay: getComputedStyle(document.querySelector('#loading-view')).display,
    diagnostics: document.querySelector('#diagnostic-count')?.textContent,
    examples: document.querySelector('#scene-example')?.options.length,
    videoExportAvailable: !document.querySelector('#export-video-button')?.disabled
  })`))
  const normalized = initial.app?.characterMetrics.every(metric => (
    metric.modelId === 'storyboard-mannequin' &&
    metric.proportion === 'human-neutral' &&
    metric.fidelity === 'storyboard-proxy' &&
    Math.abs(metric.normalizedHeight - 1.78) < 0.001
  ))
  if (
    !initial.app?.ready ||
    initial.app.sceneId !== 'forest_tracking_blocking' ||
    initial.app.renderStyle !== 'storyboard' ||
    initial.app.skinnedActors !== 2 ||
    initial.app.storyboardActors !== 2 ||
    initial.app.fallbackActors !== 0 ||
    initial.app.characterModels?.join() !== 'storyboard-mannequin' ||
    initial.examples !== 4 ||
    !initial.videoExportAvailable ||
    !normalized ||
    initial.canvas.width < minimumCanvasWidth ||
    initial.loadingDisplay !== 'none'
  ) {
    throw new Error(`Initial storyboard render assertion failed: ${JSON.stringify(initial)}`)
  }

  const initialFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  await evaluate(`document.querySelector('#play-button').click()`)
  await delay(500)
  const playbackTime = await evaluate(`window.__SHOT_DSL_APP__.getState().currentTimeMs`)
  if (playbackTime <= 0) throw new Error(`Playback did not advance: ${playbackTime}`)
  const animatedFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (animatedFrame === initialFrame) throw new Error('Canvas pixels did not change during playback')

  await seek(5000)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'marker_insert'`)
  const forestState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  if (!forestState.activeNotes?.includes('动作停顿，切道具特写') || forestState.activeIKConstraints?.join() !== 'scout') {
    throw new Error(`Storyboard note/IK assertion failed: ${JSON.stringify(forestState)}`)
  }

  await selectExample('面馆 · 多机位空间连续性')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'noodle_shop_continuity'`)
  await seek(7300)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'token_insert'`)
  const noodleState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  if (noodleState.skinnedActors !== 3 || !noodleState.activeNotes?.[0]?.includes('道具交接特写')) {
    throw new Error(`Spatial continuity assertion failed: ${JSON.stringify(noodleState)}`)
  }

  await selectExample('四人 · 道具传递与反应链')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'four_actor_prop_handoff'`)
  await seek(5000)
  const handoffState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  if (handoffState.skinnedActors !== 4 || handoffState.activeAttachments?.join() !== 'envelope') {
    throw new Error(`Prop handoff assertion failed: ${JSON.stringify(handoffState)}`)
  }
  const firstSeekFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  await seek(100)
  await seek(5000)
  const repeatedSeekFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (repeatedSeekFrame !== firstSeekFrame) throw new Error('Repeated absolute seek produced different pixels')

  await selectExample('密室 · 线索揭示与空间反转')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'chamber_clue_reveal'`)
  await seek(7600)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'overhead_reveal'`)
  const chamberState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  if (!chamberState.activeNotes?.[0]?.includes('俯视')) throw new Error(`Reveal note assertion failed: ${JSON.stringify(chamberState)}`)

  const pngLength = await evaluate(`document.querySelector('canvas').toDataURL('image/png').length`)
  if (pngLength < 10000) throw new Error(`Frame export surface is unexpectedly small: ${pngLength}`)

  let videoExportTested = false
  if (process.env.TEST_VIDEO_EXPORT) {
    const videoSource = `shotdsl 0.1
scene smoke_video {
  duration 500ms
  fps 10
  seed 1
  style storyboard
}
object marker {
  primitive box
  size [1m, 1m, 1m]
  position [0m, 0.5m, 0m]
}
camera cam {
  mode lookAt
  fov 45deg
  position [0m, 1.5m, 5m]
  target object marker
}
timeline {
  cut 0s camera cam
  note 0s "视频导出测试" duration 500ms
}`
    await evaluate(`(() => {
      const input = document.querySelector('#dsl-input')
      input.value = ${JSON.stringify(videoSource)}
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'smoke_video'`)
    await evaluate(`document.querySelector('#export-video-button').click()`)
    await waitFor(`document.querySelector('#export-video-button').disabled`)
    await waitFor(`!document.querySelector('#export-video-button').disabled`, 200)
    videoExportTested = await evaluate(`document.querySelector('#status-text').textContent.includes('WebM 视频已导出')`)
    if (!videoExportTested) throw new Error('WebM export did not reach its completed state')
  }

  await evaluate(`(() => {
    const input = document.querySelector('#dsl-input')
    input.value = 'shotdsl 0.1\\nscene broken {\\n duration 5\\n}'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await waitFor(`document.querySelector('#status')?.dataset.state === 'error'`)
  const errorCount = await evaluate(`document.querySelectorAll('.diagnostic').length`)
  if (errorCount < 2) throw new Error(`Expected compiler diagnostics, received ${errorCount}`)

  if (process.env.SCREENSHOT_PATH) {
    const screenshotExample = process.env.SCREENSHOT_EXAMPLE ?? '山林 · 追踪与道具动作'
    await selectExample(screenshotExample)
    await waitFor(`document.querySelector('#status')?.dataset.state === 'ready'`)
    if (process.env.SCREENSHOT_TIME) await seek(Number(process.env.SCREENSHOT_TIME))
    if (process.env.SCREENSHOT_SCROLL_PREVIEW) await evaluate(`document.querySelector('#preview').scrollIntoView({ block: 'center' })`)
    await delay(200)
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(process.env.SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'))
  }

  process.stdout.write(`${JSON.stringify({ initial, playbackTime: Math.round(playbackTime), forestState, noodleState, handoffState, chamberState, pngLength, videoExportTested, compilerErrors: errorCount, diagnostics }, null, 2)}\n`)
  socket.close()
  if (diagnostics.length) process.exitCode = 1
}

try {
  await run()
} finally {
  chrome.kill('SIGTERM')
}
