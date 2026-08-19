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
  const selectExample = label => evaluate(`(() => {
    const select = document.querySelector('#scene-example')
    const option = [...select.options].find(item => item.textContent === ${JSON.stringify(label)})
    if (!option) throw new Error('Unknown scene example: ' + ${JSON.stringify(label)})
    select.value = option.value
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
  if (!initial.app?.ready || initial.app.sceneId !== 'forest_tracking_prop_action' || initial.app.beatCount !== 3 || initial.app.workflowSkillCount !== 6 || initial.app.skinnedActors !== 2 || initial.app.humanActors !== 2 || initial.app.gameReadyActors !== 2 || initial.app.renderStyle !== 'cinematic' || initial.app.fallbackActors !== 0 || initial.app.characterModels?.join() !== 'game-ready-soldier' || !normalizedHumans || !humanActionsResolved || initial.canvas.width < 500 || initial.loadingDisplay !== 'none' || initial.markers < 4) {
    throw new Error(`Initial render assertion failed: ${JSON.stringify(initial)}`)
  }
  const initialFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)

  await evaluate(`document.querySelector('#play-button').click()`)
  await delay(750)
  const playbackTime = await evaluate(`window.__SHOT_DSL_APP__.getState().currentTimeMs`)
  if (playbackTime <= 0) throw new Error(`Playback did not advance: ${playbackTime}`)
  const animatedFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (animatedFrame === initialFrame) throw new Error('Canvas pixels did not change during playback')

  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '5500'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'token_insert'`)
  const forestState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  if (forestState.activeGazes?.sort().join() !== 'partner,scout') throw new Error(`Forest prop-focus assertion failed: ${JSON.stringify(forestState)}`)

  await selectExample('面馆 · 多机位空间连续性')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'noodle_shop_spatial_coverage'`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '8000'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'token_insert'`)
  const noodleState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  if (noodleState.renderStyle !== 'cinematic-outline' || noodleState.beatCount !== 3 || noodleState.workflowSkillCount !== 6 || noodleState.skinnedActors !== 3 || noodleState.fallbackActors !== 0 || noodleState.characterModels?.join() !== 'human-mannequin' || noodleState.activeGazes?.sort().join() !== 'customer,owner') throw new Error(`Spatial coverage assertion failed: ${JSON.stringify(noodleState)}`)

  await selectExample('宫宴 · 试探与反应镜头')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'palace_banquet_reaction_chain'`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '7600'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'envoy_ecu'`)
  const palaceState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  if (palaceState.skinnedActors !== 3 || palaceState.fallbackActors !== 0 || palaceState.activeGazes?.sort().join() !== 'attendant,envoy,ruler') throw new Error(`Reaction-chain assertion failed: ${JSON.stringify(palaceState)}`)

  await selectExample('密室 · 线索揭示与空间反转')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'chamber_clue_spatial_reveal'`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '7500'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'overhead_reveal'`)
  const chamberState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  if (chamberState.skinnedActors !== 3 || chamberState.gameReadyActors !== 1 || chamberState.fallbackActors !== 0 || chamberState.activeGazes?.join() !== 'analyst') throw new Error(`Clue-reveal assertion failed: ${JSON.stringify(chamberState)}`)

  await selectExample('四人 · 道具传递与反应链')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'four_actor_prop_reaction_chain'`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '10800'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'group_orbit'`)
  const seekState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  if (seekState.skinnedActors !== 4 || seekState.humanActors !== 4 || seekState.fallbackActors !== 0 || seekState.characterModels?.join() !== 'human-mannequin' || seekState.activeGazes?.sort().join() !== 'ally,healer' || Math.abs(seekState.currentTimeMs - 10800) > 1) throw new Error(`Seek assertion failed: ${JSON.stringify(seekState)}`)

  const firstSeekFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '100'; range.dispatchEvent(new Event('input', { bubbles: true })); range.value = '10800'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  const repeatedSeekFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (repeatedSeekFrame !== firstSeekFrame) throw new Error('Repeated absolute seek produced different character pixels')

  const pngLength = await evaluate(`document.querySelector('canvas').toDataURL('image/png').length`)
  if (pngLength < 10000) throw new Error(`Frame export surface is unexpectedly small: ${pngLength}`)

  await selectExample('非遗 · 表演与工艺覆盖')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'heritage_mask_performance_coverage'`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '8000'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'dance_orbit'`)
  const heritageState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  const danceSample = heritageState.characterSamples?.find(sample => sample.actorId === 'performer')?.actions.find(action => action.asset === 'Dance_Simple')
  if (heritageState.skinnedActors !== 2 || heritageState.fallbackActors !== 0 || !danceSample) throw new Error(`Heritage performance assertion failed: ${JSON.stringify(heritageState)}`)

  await selectExample('战场 · 攻防反应链')
  await waitFor(`window.__SHOT_DSL_APP__.getState().sceneId === 'battlefield_attack_response_chain'`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '2092'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`window.__SHOT_DSL_APP__.getState().camera === 'first_impact'`)
  const impactState = JSON.parse(await evaluate(`JSON.stringify(window.__SHOT_DSL_APP__.getState())`))
  const impactFrame = impactState.activeCameraFrame
  const punchSample = impactState.characterSamples?.find(sample => sample.actorId === 'vanguard')?.actions.find(action => action.asset === 'Punch_Jab')
  if (impactState.skinnedActors !== 3 || impactState.humanActors !== 3 || impactState.gameReadyActors !== 0 || impactState.fallbackActors !== 0 || impactFrame?.mode !== 'impact' || impactFrame?.boneTargetsResolved !== 2 || impactFrame?.contactDistance > 0.2 || Math.abs((punchSample?.time ?? -1) - 0.292) > 0.002) {
    throw new Error(`Impact close-up assertion failed: ${JSON.stringify(impactState)}`)
  }
  const firstImpactFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  await evaluate(`(() => { const range = document.querySelector('#timeline'); range.value = '1000'; range.dispatchEvent(new Event('input', { bubbles: true })); range.value = '2092'; range.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  const repeatedImpactFrame = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`)
  if (repeatedImpactFrame !== firstImpactFrame) throw new Error('Repeated impact-camera seek produced different pixels')

  await evaluate(`(() => { const input = document.querySelector('#dsl-input'); input.value = 'shotdsl 0.1\\nscene broken {\\n duration 5\\n}'; input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await waitFor(`document.querySelector('#status')?.dataset.state === 'error'`)
  const errorCount = await evaluate(`document.querySelectorAll('.diagnostic').length`)
  if (errorCount < 2) throw new Error(`Expected compiler diagnostics, received ${errorCount}`)

  if (process.env.SCREENSHOT_PATH) {
    const screenshotExample = process.env.SCREENSHOT_EXAMPLE ?? '山林 · 追踪与道具动作'
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

  const result = { initial, playbackTime: Math.round(playbackTime), forestState, noodleState, palaceState, chamberState, seekState, heritageState, impactState, pngLength, compilerErrors: errorCount, diagnostics }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  socket.close()
  if (diagnostics.length) process.exitCode = 1
}

try {
  await run()
} finally {
  chrome.kill('SIGTERM')
}
