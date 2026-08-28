import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { syncExamples } from './example-files.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'dist')

await rm(output, { recursive: true, force: true })
await Promise.all([
  mkdir(resolve(output, 'assets'), { recursive: true }),
  mkdir(resolve(output, 'storyboard'), { recursive: true })
])
await Promise.all([
  cp(resolve(root, 'index.html'), resolve(output, 'index.html')),
  cp(resolve(root, 'storyboard/index.html'), resolve(output, 'storyboard/index.html')),
  cp(resolve(root, 'styles.css'), resolve(output, 'styles.css')),
  cp(resolve(root, 'public'), output, { recursive: true }),
  syncExamples(resolve(output, 'examples')),
  build({
    entryPoints: [resolve(root, 'src/app.js')],
    bundle: true,
    minify: true,
    sourcemap: true,
    outfile: resolve(output, 'assets/app.js'),
    target: ['es2022'],
    legalComments: 'none'
  })
])

process.stdout.write('Built dist/\n')
