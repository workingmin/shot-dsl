import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHARACTER_CATALOG } from '../src/shotdsl/catalog.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const JSON_CHUNK = 0x4e4f534a
const GLB_MAGIC = 0x46546c67

const readGlbJson = buffer => {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC || buffer.readUInt32LE(4) !== 2) throw new Error('Expected a glTF 2.0 binary asset')
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset)
    const type = buffer.readUInt32LE(offset + 4)
    if (type === JSON_CHUNK) return JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString('utf8').replace(/\0+$/g, '').trim())
    offset += 8 + length
  }
  throw new Error('GLB JSON chunk is missing')
}

const unique = values => [...new Set(values.filter(Boolean))].sort()
const sanitizeNodeName = name => name.replace(/\s/g, '_').replace(/[\[\].:\/]/g, '')

const inspectGlb = json => ({
  animations: unique((json.animations ?? []).map(animation => animation.name)),
  nodes: unique((json.nodes ?? []).flatMap(node => node.name ? [node.name, sanitizeNodeName(node.name)] : [])),
  morphTargets: unique((json.meshes ?? []).flatMap(mesh => [
    ...(mesh.extras?.targetNames ?? []),
    ...(mesh.primitives ?? []).flatMap(primitive => primitive.extras?.targetNames ?? [])
  ]))
})

export const auditCharacterAssets = async () => {
  const assets = []
  const errors = []
  const warnings = []
  for (const [id, model] of Object.entries(CHARACTER_CATALOG).filter(([, definition]) => definition.url)) {
    const path = resolve(root, 'public', model.url.replace(/^\//, ''))
    let inspection
    try {
      inspection = inspectGlb(readGlbJson(await readFile(path)))
    } catch (error) {
      errors.push(`${id}: ${error.message}`)
      continue
    }
    for (const field of ['source', 'license', 'rig']) {
      if (!model[field]) errors.push(`${id}: catalog metadata '${field}' is required`)
    }
    const actionAssets = Object.entries(model.clips).map(([action, mapping]) => ({
      action,
      asset: typeof mapping === 'string' ? mapping : mapping.asset,
      support: typeof mapping === 'string' ? 'exact' : mapping.support
    }))
    for (const mapping of actionAssets) {
      if (!inspection.animations.includes(mapping.asset)) errors.push(`${id}: action '${mapping.action}' references missing animation '${mapping.asset}'`)
    }
    for (const [semantic, node] of Object.entries(model.bones ?? {})) {
      if (!inspection.nodes.includes(node)) errors.push(`${id}: semantic bone '${semantic}' references missing node '${node}'`)
    }
    if (model.license?.distribution !== 'allowed') warnings.push(`${id}: distribution policy is '${model.license?.distribution ?? 'unspecified'}'`)
    assets.push({
      id,
      file: model.url,
      license: model.license,
      rig: model.rig,
      animations: inspection.animations.length,
      semanticActions: actionAssets.length,
      exactActions: actionAssets.filter(mapping => mapping.support === 'exact').length,
      morphTargets: inspection.morphTargets
    })
  }
  return { ok: errors.length === 0, assets, errors, warnings }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await auditCharacterAssets()
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    process.stdout.write(`Character assets: ${report.assets.length} audited · ${report.errors.length} errors · ${report.warnings.length} warnings\n`)
    for (const asset of report.assets) process.stdout.write(`- ${asset.id}: ${asset.animations} animations · ${asset.semanticActions} semantic actions · ${asset.morphTargets.length} morph targets · ${asset.license.id}\n`)
    for (const warning of report.warnings) process.stdout.write(`warning: ${warning}\n`)
    for (const error of report.errors) process.stderr.write(`error: ${error}\n`)
  }
  if (!report.ok) process.exitCode = 1
}
