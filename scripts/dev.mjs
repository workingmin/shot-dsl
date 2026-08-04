import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { context } from 'esbuild'

import { startStaticServer } from './server-lib.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const prototypeRoot = path.join(projectRoot, 'prototype')
const outputRoot = path.join(projectRoot, 'dist')
const port = Number.parseInt(process.env.PORT ?? '4173', 10)

await mkdir(path.join(outputRoot, 'assets'), { recursive: true })
await Promise.all([
  cp(path.join(prototypeRoot, 'index.html'), path.join(outputRoot, 'index.html')),
  cp(path.join(prototypeRoot, 'styles.css'), path.join(outputRoot, 'styles.css')),
  cp(
    path.join(prototypeRoot, 'upstream/src/data/sts'),
    path.join(outputRoot, 'data/sts'),
    { recursive: true }
  )
])

const buildContext = await context({
  entryPoints: [path.join(prototypeRoot, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: false,
  sourcemap: true,
  outfile: path.join(outputRoot, 'assets/app.js'),
  logLevel: 'info'
})

await buildContext.watch()
const server = startStaticServer({ root: outputRoot, port })

const shutdown = async () => {
  server.close()
  await buildContext.dispose()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
