const exampleBaseUrl = '/examples/character-image'

const readResponse = async (response, resourceName) => {
  if (!response.ok) throw new Error(`无法加载${resourceName}（HTTP ${response.status}）`)
  return response
}

export const loadCharacterExamples = async () => {
  const manifestResponse = await readResponse(
    await fetch(`${exampleBaseUrl}/manifest.json`, { cache: 'no-store' }),
    '人物示例清单'
  )
  const manifest = await manifestResponse.json()
  if (!Array.isArray(manifest.examples) || manifest.examples.length === 0) {
    throw new Error('人物示例目录中没有 .txt 描述文件')
  }
  const examples = await Promise.all(manifest.examples.map(async example => {
    const promptResponse = await readResponse(
      await fetch(`${exampleBaseUrl}/${encodeURIComponent(example.file)}`, { cache: 'no-store' }),
      `人物示例“${example.label}”`
    )
    return { ...example, prompt: (await promptResponse.text()).trim() }
  }))
  if (!examples.some(example => example.id === manifest.defaultExampleId)) {
    throw new Error('人物示例清单缺少有效的默认项')
  }
  return { defaultExampleId: manifest.defaultExampleId, examples }
}
