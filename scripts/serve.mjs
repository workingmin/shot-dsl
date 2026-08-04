import { resolve } from 'node:path'
import { createStaticServer } from './server-lib.mjs'

createStaticServer({
  root: resolve(import.meta.dirname, '..', 'dist'),
  port: Number(process.env.PORT ?? 4173),
  host: process.env.HOST ?? '127.0.0.1'
})
