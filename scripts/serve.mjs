import { resolve } from 'node:path'
import { createCharacterAssetsApi } from './character-assets-api.mjs'
import { createStaticServer } from './server-lib.mjs'

const root = resolve(import.meta.dirname, '..')
const requestHandler = await createCharacterAssetsApi({ dataDir: resolve(root, '.shotdsl-data/character-assets') })
createStaticServer({
  root: resolve(root, 'dist'),
  port: Number(process.env.PORT ?? 4173),
  host: process.env.HOST ?? '127.0.0.1',
  requestHandler
})
