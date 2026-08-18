import { watch } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { context } from 'esbuild'
import { exampleSourceDirectory, syncExamples } from './example-files.mjs'
import { createStaticServer } from './server-lib.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'dist')
await mkdir(resolve(output, 'assets'), { recursive: true })
await Promise.all([
  cp(resolve(root, 'index.html'), resolve(output, 'index.html')),
  cp(resolve(root, 'styles.css'), resolve(output, 'styles.css')),
  cp(resolve(root, 'public'), output, { recursive: true }),
  syncExamples(resolve(output, 'examples'))
])

const buildContext = await context({
  entryPoints: [resolve(root, 'src/app.js')],
  bundle: true,
  sourcemap: true,
  outfile: resolve(output, 'assets/app.js'),
  target: ['es2022']
})
await buildContext.watch()
const server = createStaticServer({ root: output, port: Number(process.env.PORT ?? 4173), host: process.env.HOST ?? '127.0.0.1' })
let exampleSyncTimer = null
const exampleWatcher = watch(exampleSourceDirectory, () => {
  clearTimeout(exampleSyncTimer)
  exampleSyncTimer = setTimeout(() => {
    syncExamples(resolve(output, 'examples')).catch(error => console.error(`Example sync failed: ${error.message}`))
  }, 80)
})

const shutdown = async () => {
  clearTimeout(exampleSyncTimer)
  exampleWatcher.close()
  await buildContext.dispose()
  server.close()
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
