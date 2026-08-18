import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const debugPort = Number(process.env.DEBUG_PORT ?? 9223)
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:4173'

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
  '--window-size=1500,1050',
  'about:blank'
], { stdio: ['ignore', 'ignore', 'ignore'] })

const waitForPageTarget = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const targets = await response.json()
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
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') diagnostics.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '))
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
  const selectExample = id => evaluate(`(() => {
    const select = document.querySelector('#scene-example')
    select.value = ${JSON.stringify(id)}
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)

  await Promise.all([send('Runtime.enable'), send('Network.enable'), send('Page.enable')])
  await send('Page.navigate', { url: appUrl })
  await waitFor(`document.querySelector('#status')?.dataset.state === 'ready'`)

  const initial = JSON.parse(await evaluate(`JSON.stringify({
    app: window.__SHOT_DSL_APP__?.getState(),
    canvas: { width: document.querySelector('canvas')?.width, height: document.querySelector('canvas')?.height },
    loadingDisplay: getComputedStyle(document.querySelector('#loading-view')).display,
    diagnostics: document.querySelector('#diagnostic-count')?.textContent,
    markers: document.querySelectorAll('.event-marker').length
  })`))
  const initialHumanMetrics = initial.app?.characterMetrics ?? []
  const normalizedHumans = initialHumanMetrics.every(metric => metric.modelId === 'game-ready-soldier' && metric.proportion === 'human-realistic' && metric.fidelity === 'game-ready' && Math.abs(metric.normalizedHeight - 1.78) < 0.001)
  const initialAssetActions = (initial.app?.characterSamples ?? []).flatMap(sample => sample.actions.map(action => action.asset))
  const humanActionsResolved = initialAssetActions.length === 2 && initialAssetActions.every(asset => asset === 'Idle')
  if (!initial.app?.ready || initial.app.sceneId !== 'night_extraction' || initial.app.skinnedActors !== 2 || initial.app.humanActors !== 2 || initial.app.gameReadyActors !== 2 || initial.app.renderStyle !== 'cinematic' || initial.app.fallbackActors !== 0 || initial.app.characterModels?.join() !== 'game-ready-soldier' || !normalizedHumans || !humanActionsResolved || initial.canvas.width < 500 || initial.loadingDisplay !== 'none' || initial.markers < 4) {
    throw new Error(`Initial render assertion failed: ${JSON.stringify(initial)}`)
  }
  const initialFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)

  await evaluate(`document.querySelector('#play-button').click()`)
  await delay(750)
  const playbackTime = await evaluate(`window.__SHOT_DSL_APP__.getState().currentTimeMs`)
  if (playbackTime <= 0) throw new Error(`Playback did not advance: ${playbackTime}`)
  const animatedFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (animatedFrame === initialFrame) throw new Error('Canvas pixels did not change during playback')

  await selectExample('ensemble-brawl')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'warehouse_ensemble_brawl'`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '4300'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'orbit_cam'`)
  const seekState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  if (seekState.entityCount !== 8 || seekState.skinnedActors !== 3 || seekState.humanActors !== 3 || seekState.gameReadyActors !== 0 || seekState.fallbackActors !== 0 || seekState.characterModels?.join() !== 'human-mannequin' || Math.abs(seekState.currentTimeMs - 4300) > 1) throw new Error(`Seek assertion failed: ${JSON.stringify(seekState)}`)

  const firstSeekFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '100'; range.dispatchEvent(new Event('input', { bubbles: true })); range.value = '4300'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  const repeatedSeekFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (repeatedSeekFrame !== firstSeekFrame) throw new Error('Repeated absolute seek produced different character pixels')

  const pngLength = await evaluate(`document.querySelector('canvas').toDataURL('image/png').length`)
  if (pngLength < 10000) throw new Error(`Frame export surface is unexpectedly small: ${pngLength}`)

  await selectExample('fight-closeup')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'fight_coverage_closeup'`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '1092'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'face_impact'`)
  const impactState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  const impactFrame = impactState.activeCameraFrame
  const punchSample = impactState.characterSamples?.find(sample => sample.actorId === 'boxer')?.actions.find(action => action.asset === 'Punch_Jab')
  if (impactState.skinnedActors !== 2 || impactState.humanActors !== 2 || impactState.gameReadyActors !== 0 || impactState.fallbackActors !== 0 || impactFrame?.mode !== 'impact' || impactFrame?.boneTargetsResolved !== 2 || impactFrame?.contactDistance > 0.2 || Math.abs((punchSample?.time ?? -1) - 0.292) > 0.002) {
    throw new Error(`Impact close-up assertion failed: ${JSON.stringify(impactState)}`)
  }
  const firstImpactFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '1000'; range.dispatchEvent(new Event('input', { bubbles: true })); range.value = '1092'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  const repeatedImpactFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (repeatedImpactFrame !== firstImpactFrame) throw new Error('Repeated impact-camera seek produced different pixels')

  await selectExample('calisthenics-long')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'broadcast_calisthenics_390s'`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '305000'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`window.__SHOT_DSL_APP__.getState().currentTimeMs === 305000`)
  const longPushupState = JSON.parse(await evaluate(`JSON.stringify({ app: window.__SHOT_DSL_APP__.getState(), duration: document.querySelector('#duration')?.textContent, markers: document.querySelectorAll('.event-marker').length })`))
  const pushupAssets = longPushupState.app.characterSamples.flatMap(sample => sample.actions.map(action => action.asset))
  if (longPushupState.app.skinnedActors !== 5 || longPushupState.app.humanActors !== 5 || longPushupState.app.fallbackActors !== 0 || longPushupState.app.camera !== 'side_floor' || pushupAssets.length !== 5 || !pushupAssets.every(asset => asset === 'Pushup') || longPushupState.duration !== '06:30.000' || longPushupState.markers < 50) {
    throw new Error(`Long pushup-section assertion failed: ${JSON.stringify(longPushupState)}`)
  }
  const firstLongFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '375000'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  const longCooldownState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  const cooldownAssets = longCooldownState.characterSamples.flatMap(sample => sample.actions.map(action => action.asset))
  if (longCooldownState.camera !== 'coach' || cooldownAssets.length !== 5 || !cooldownAssets.every(asset => asset === 'Idle_Subtle')) throw new Error(`Long cooldown-section assertion failed: ${JSON.stringify(longCooldownState)}`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '305000'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  const repeatedLongFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (repeatedLongFrame !== firstLongFrame) throw new Error('Repeated five-minute seek produced different pixels')

  await evaluate(`(() => { const input = document.querySelector('#dsl-input'); input.value = 'shotdsl 0.1\\nscene broken {\\n duration 5\\n}'; input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`document.querySelector('#status')?.dataset.state === 'error'`)
  const errorCount = await evaluate(`document.querySelectorAll('.diagnostic').length`)
  if (errorCount < 2) throw new Error(`Expected compiler diagnostics, received ${errorCount}`)

  if (process.env.SCREENSHOT_PATH) {
    const screenshotExample = process.env.SCREENSHOT_EXAMPLE ?? 'cinematic-pursuit'
    await selectExample(screenshotExample)
    await waitFor(`document.querySelector('#status')?.dataset.state === 'ready'`)
    if (process.env.SCREENSHOT_TIME) {
      const screenshotTime = Number(process.env.SCREENSHOT_TIME)
      await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '${screenshotTime}'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    }
    await delay(200)
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(process.env.SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'))
  }

  const result = { initial, playbackTime: Math.round(playbackTime), seekState, impactState, longPushupState, longCooldownState, pngLength, compilerErrors: errorCount, diagnostics }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  socket.close()
  if (diagnostics.length) process.exitCode = 1
}

try {
  await run()
} finally {
  chrome.kill('SIGTERM')
}
