import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const prototypeRoot = path.join(projectRoot, 'prototype')
const outputRoot = path.join(projectRoot, 'dist')

await rm(outputRoot, { recursive: true, force: true })
await mkdir(path.join(outputRoot, 'assets'), { recursive: true })

await build({
  entryPoints: [path.join(prototypeRoot, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: false,
  sourcemap: true,
  outfile: path.join(outputRoot, 'assets/app.js'),
  logLevel: 'info'
})

await Promise.all([
  cp(path.join(prototypeRoot, 'index.html'), path.join(outputRoot, 'index.html')),
  cp(path.join(prototypeRoot, 'styles.css'), path.join(outputRoot, 'styles.css')),
  cp(
    path.join(prototypeRoot, 'upstream/src/data/sts'),
    path.join(outputRoot, 'data/sts'),
    { recursive: true }
  )
])
