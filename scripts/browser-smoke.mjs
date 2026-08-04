import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const debugPort = 9223
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:4173'

const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--use-angle=swiftshader',
  `--remote-debugging-port=${debugPort}`,
  '--window-size=1440,1000',
  'about:blank'
], { stdio: ['ignore', 'ignore', 'ignore'] })

const waitForPageTarget = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const targets = await response.json()
      const page = targets.find(target => target.type === 'page')
      if (page) return page
    } catch {
      // Chrome is still starting.
    }
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
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
      return
    }

    if (message.method === 'Runtime.exceptionThrown') {
      diagnostics.push(message.params.exceptionDetails.text)
      const description = message.params.exceptionDetails.exception?.description
      if (description) diagnostics.push(description)
    }
    if (message.method === 'Network.loadingFailed') {
      diagnostics.push(`${message.params.errorText}: ${message.params.type}`)
    }
  })

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    sequence += 1
    pending.set(sequence, { resolve, reject })
    socket.send(JSON.stringify({ id: sequence, method, params }))
  })

  await Promise.all([
    send('Runtime.enable'),
    send('Network.enable'),
    send('Page.enable')
  ])
  await send('Page.navigate', { url: appUrl })

  let state
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await delay(100)
    const evaluation = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        state: document.querySelector('#status')?.dataset.state,
        status: document.querySelector('#status-text')?.textContent,
        canvas: Boolean(document.querySelector('#preview canvas')),
        params: document.querySelectorAll('#parsed-params .param').length,
        error: document.querySelector('#parsed-params .error-message')?.textContent ?? null
      })`,
      returnByValue: true
    })
    state = JSON.parse(evaluation.result.value)
    if (state.state === 'ready' || state.state === 'error') break
  }

  if (state?.state === 'ready') {
    const firstSeed = await send('Runtime.evaluate', {
      expression: "document.querySelector('#seed-label').textContent",
      returnByValue: true
    })
    await send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.querySelector('#dsl-input')
        input.value = 'close up single right eye long lens female cautious light small room'
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })()`
    })

    for (let attempt = 0; attempt < 50; attempt += 1) {
      await delay(100)
      const changed = await send('Runtime.evaluate', {
        expression: `JSON.stringify({
          seed: document.querySelector('#seed-label').textContent,
          model: [...document.querySelectorAll('#parsed-params .param')]
            .some(item => item.textContent.includes('modelfemale')),
          canvas: Boolean(document.querySelector('#preview canvas'))
        })`,
        returnByValue: true
      })
      const interaction = JSON.parse(changed.result.value)
      if (interaction.seed !== firstSeed.result.value && interaction.model && interaction.canvas) {
        state.interaction = 'passed'
        break
      }
    }
  }

  process.stdout.write(`${JSON.stringify({ state, diagnostics }, null, 2)}\n`)
  socket.close()

  if (state?.state !== 'ready' || !state.canvas || state.params === 0 || state.interaction !== 'passed') {
    process.exitCode = 1
  }
}

try {
  await run()
} finally {
  chrome.kill('SIGTERM')
}
