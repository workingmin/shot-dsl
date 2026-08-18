const readResponse = async (response, resourceName) => {
  if (!response.ok) throw new Error(`无法加载${resourceName}（HTTP ${response.status}）`)
  return response
}

export const loadExamples = async () => {
  const response = await readResponse(await fetch('/examples/manifest.json', { cache: 'no-store' }), '场景示例清单')
  const manifest = await response.json()
  if (!Array.isArray(manifest.examples) || manifest.examples.length === 0) throw new Error('场景示例目录中没有 .shotdsl 文件')
  return manifest.examples
}

export const loadExampleSource = async example => {
  const path = `/examples/${encodeURIComponent(example.file)}`
  const response = await readResponse(await fetch(path, { cache: 'no-store' }), `场景示例“${example.label}”`)
  return response.text()
}
