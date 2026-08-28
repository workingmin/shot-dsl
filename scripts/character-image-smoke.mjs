import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const debugPort = Number(process.env.DEBUG_PORT ?? 9224)
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:4173/character-image/'
const windowSize = process.env.WINDOW_SIZE ?? '1440,960'
const minimumCanvasWidth = Number(process.env.MIN_CANVAS_WIDTH ?? 520)

const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
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
  let sequence = 0
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const result = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) result.reject(new Error(message.error.message))
      else result.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') diagnostics.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
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
  const waitFor = async (expression, attempts = 120) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const value = await evaluate(expression)
      if (value) return value
      await delay(100)
    }
    throw new Error(`Timed out waiting for: ${expression}`)
  }

  await Promise.all([send('Runtime.enable'), send('Page.enable')])
  await send('Page.navigate', { url: appUrl })
  await waitFor(`window.__CHARACTER_IMAGE_APP__?.getState().ready`)
  await delay(250)

  const initial = JSON.parse(await evaluate(`JSON.stringify({
    pathname: location.pathname,
    app: window.__CHARACTER_IMAGE_APP__.getState(),
    canvas: { width: document.querySelector('canvas').width, height: document.querySelector('canvas').height },
    loadingHidden: document.querySelector('#viewer-loading').hidden,
    promptLength: document.querySelector('#character-prompt').value.length,
    example: document.querySelector('#character-example').value,
    exampleCount: document.querySelectorAll('#character-example option').length,
    viewButtons: document.querySelectorAll('[data-view]').length,
    layout: (() => {
      const stage = document.querySelector('#character-stage').getBoundingClientRect()
      const exportButton = document.querySelector('#export-turnaround').getBoundingClientRect()
      return { stageLeft: stage.left, stageRight: stage.right, stageHeight: stage.height, exportRight: exportButton.right, viewportWidth: innerWidth }
    })()
  })`))
  if (
    initial.pathname !== '/character-image/' ||
    initial.app.modelKind !== 'sample' ||
    initial.app.metrics?.triangles < 1000 ||
    initial.app.metrics?.materials < 1 ||
    initial.app.metrics?.textures < 1 ||
    initial.canvas.width < minimumCanvasWidth ||
    initial.canvas.height < 350 ||
    !initial.loadingHidden ||
    initial.promptLength < 5 ||
    initial.exampleCount !== 6 ||
    initial.example === 'custom' ||
    initial.viewButtons !== 4 ||
    initial.layout.stageLeft < -1 ||
    initial.layout.stageRight > initial.layout.viewportWidth + 1 ||
    initial.layout.exportRight > initial.layout.viewportWidth + 1
  ) throw new Error(`Initial character viewer assertion failed: ${JSON.stringify(initial)}`)

  const selectedExample = JSON.parse(await evaluate(`(() => {
    const select = document.querySelector('#character-example')
    select.value = 'retired_carpenter'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return JSON.stringify({
      example: select.value,
      prompt: document.querySelector('#character-prompt').value,
      query: location.search
    })
  })()`))
  if (
    selectedExample.example !== 'retired_carpenter' ||
    !selectedExample.prompt.includes('退休木匠') ||
    selectedExample.query !== '?example=retired_carpenter'
  ) throw new Error(`Character example selection failed: ${JSON.stringify(selectedExample)}`)

  const frontFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (frontFrame.length < 10000) throw new Error(`Character canvas is unexpectedly small: ${frontFrame.length}`)
  await evaluate(`document.querySelector('[data-view="left"]').click()`)
  await waitFor(`window.__CHARACTER_IMAGE_APP__.getState().view === 'left'`)
  await delay(180)
  const sideFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (frontFrame === sideFrame) throw new Error('Front and side views produced identical canvas pixels')

  const turnaroundBytes = await evaluate(`window.__CHARACTER_IMAGE_APP__.exportTurnaround()`)
  if (turnaroundBytes < 10000) throw new Error(`Three-view export is unexpectedly small: ${turnaroundBytes}`)

  if (process.env.SCREENSHOT_PATH) {
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(process.env.SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'))
  }
  process.stdout.write(`${JSON.stringify({ initial, frontFrameLength: frontFrame.length, sideFrameLength: sideFrame.length, turnaroundBytes, diagnostics }, null, 2)}\n`)
  socket.close()
  if (diagnostics.length) process.exitCode = 1
}

try {
  await run()
} finally {
  chrome.kill('SIGTERM')
}
