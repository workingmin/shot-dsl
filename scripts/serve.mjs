import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startStaticServer } from './server-lib.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number.parseInt(process.env.PORT ?? '4173', 10)

startStaticServer({ root: path.join(projectRoot, 'dist'), port })
