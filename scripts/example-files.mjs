import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
export const exampleSourceDirectory = resolve(root, 'examples')
const defaultExampleFile = '山林 · 追踪与道具动作.shotdsl'

const compareExampleFiles = (left, right) => {
  if (left === defaultExampleFile) return -1
  if (right === defaultExampleFile) return 1
  return left.localeCompare(right, 'zh-CN')
}

export const listExampleFiles = async (sourceDirectory = exampleSourceDirectory) => {
  const entries = await readdir(sourceDirectory, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.shotdsl')
    .map(entry => entry.name)
    .sort(compareExampleFiles)
}

export const createExampleManifest = async (sourceDirectory = exampleSourceDirectory) => {
  const files = await listExampleFiles(sourceDirectory)
  if (files.length === 0) throw new Error(`No .shotdsl examples found in ${sourceDirectory}`)
  return {
    examples: files.map(file => ({
      id: file,
      label: basename(file, extname(file)),
      file
    }))
  }
}

export const readExamples = async (sourceDirectory = exampleSourceDirectory) => {
  const manifest = await createExampleManifest(sourceDirectory)
  return Promise.all(manifest.examples.map(async example => ({
    ...example,
    source: await readFile(resolve(sourceDirectory, example.file), 'utf8')
  })))
}

export const syncExamples = async outputDirectory => {
  const manifest = await createExampleManifest()
  await mkdir(outputDirectory, { recursive: true })
  const expectedFiles = new Set(manifest.examples.map(example => example.file))
  const outputEntries = await readdir(outputDirectory, { withFileTypes: true })
  await Promise.all([
    ...manifest.examples.map(example => (
      cp(resolve(exampleSourceDirectory, example.file), resolve(outputDirectory, example.file))
    )),
    ...outputEntries
      .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.shotdsl' && !expectedFiles.has(entry.name))
      .map(entry => rm(resolve(outputDirectory, entry.name), { force: true }))
  ])
  await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}
