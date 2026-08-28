import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
export const exampleSourceDirectory = resolve(root, 'examples')
export const storyboardExampleSourceDirectory = resolve(exampleSourceDirectory, 'storyboard')
export const characterImageExampleSourceDirectory = resolve(exampleSourceDirectory, 'character-image')
export const exampleSourceDirectories = [storyboardExampleSourceDirectory, characterImageExampleSourceDirectory]

const defaultStoryboardFile = '山林 · 追踪与道具动作.shotdsl'
const manifestFile = 'manifest.json'

const compareStoryboardFiles = (left, right) => {
  if (left === defaultStoryboardFile) return -1
  if (right === defaultStoryboardFile) return 1
  return left.localeCompare(right, 'zh-CN')
}

export const listStoryboardExampleFiles = async (sourceDirectory = storyboardExampleSourceDirectory) => {
  const entries = await readdir(sourceDirectory, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.shotdsl')
    .map(entry => entry.name)
    .sort(compareStoryboardFiles)
}

export const createStoryboardExampleManifest = async (sourceDirectory = storyboardExampleSourceDirectory) => {
  const files = await listStoryboardExampleFiles(sourceDirectory)
  if (files.length === 0) throw new Error(`No .shotdsl examples found in ${sourceDirectory}`)
  return {
    examples: files.map(file => ({
      id: file,
      label: basename(file, extname(file)),
      file
    }))
  }
}

export const readStoryboardExamples = async (sourceDirectory = storyboardExampleSourceDirectory) => {
  const manifest = await createStoryboardExampleManifest(sourceDirectory)
  return Promise.all(manifest.examples.map(async example => ({
    ...example,
    source: await readFile(resolve(sourceDirectory, example.file), 'utf8')
  })))
}

const readCharacterImageManifest = async sourceDirectory => {
  const path = resolve(sourceDirectory, manifestFile)
  let manifest
  try {
    manifest = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read character-image example manifest at ${path}: ${error.message}`)
  }
  if (!manifest || !Array.isArray(manifest.examples) || manifest.examples.length === 0) {
    throw new Error(`No character-image examples found in ${path}`)
  }
  if (typeof manifest.defaultExampleId !== 'string') throw new Error(`Missing defaultExampleId in ${path}`)
  return manifest
}

export const readCharacterImageExamples = async (sourceDirectory = characterImageExampleSourceDirectory) => {
  const manifest = await readCharacterImageManifest(sourceDirectory)
  const ids = new Set()
  const files = new Set()
  const examples = await Promise.all(manifest.examples.map(async example => {
    if (!example || typeof example.id !== 'string' || !/^[a-z0-9_]+$/.test(example.id)) {
      throw new Error('Character-image example ids must use lowercase ASCII letters, numbers, and underscores')
    }
    if (ids.has(example.id)) throw new Error(`Duplicate character-image example id: ${example.id}`)
    if (typeof example.label !== 'string' || example.label.trim().length < 2) {
      throw new Error(`Character-image example ${example.id} has an invalid label`)
    }
    if (typeof example.file !== 'string' || basename(example.file) !== example.file || extname(example.file).toLowerCase() !== '.txt') {
      throw new Error(`Character-image example ${example.id} must reference one local .txt file`)
    }
    if (files.has(example.file)) throw new Error(`Duplicate character-image example file: ${example.file}`)
    ids.add(example.id)
    files.add(example.file)
    const prompt = (await readFile(resolve(sourceDirectory, example.file), 'utf8')).trim()
    if (prompt.length < 5 || prompt.length > 360) {
      throw new Error(`Character-image example ${example.id} prompt must contain 5-360 characters`)
    }
    return { id: example.id, label: example.label.trim(), file: example.file, prompt }
  }))
  if (!ids.has(manifest.defaultExampleId)) {
    throw new Error(`Unknown default character-image example: ${manifest.defaultExampleId}`)
  }
  return { defaultExampleId: manifest.defaultExampleId, examples }
}

const syncStoryboardExamples = async outputDirectory => {
  const manifest = await createStoryboardExampleManifest()
  await mkdir(outputDirectory, { recursive: true })
  const expectedFiles = new Set(manifest.examples.map(example => example.file))
  const outputEntries = await readdir(outputDirectory, { withFileTypes: true })
  await Promise.all([
    ...manifest.examples.map(example => (
      cp(resolve(storyboardExampleSourceDirectory, example.file), resolve(outputDirectory, example.file))
    )),
    ...outputEntries
      .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.shotdsl' && !expectedFiles.has(entry.name))
      .map(entry => rm(resolve(outputDirectory, entry.name), { force: true }))
  ])
  await writeFile(resolve(outputDirectory, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`)
}

const syncCharacterImageExamples = async outputDirectory => {
  const catalog = await readCharacterImageExamples()
  const manifest = {
    defaultExampleId: catalog.defaultExampleId,
    examples: catalog.examples.map(({ id, label, file }) => ({ id, label, file }))
  }
  await mkdir(outputDirectory, { recursive: true })
  const expectedFiles = new Set(manifest.examples.map(example => example.file))
  const outputEntries = await readdir(outputDirectory, { withFileTypes: true })
  await Promise.all([
    ...manifest.examples.map(example => (
      cp(resolve(characterImageExampleSourceDirectory, example.file), resolve(outputDirectory, example.file))
    )),
    ...outputEntries
      .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.txt' && !expectedFiles.has(entry.name))
      .map(entry => rm(resolve(outputDirectory, entry.name), { force: true }))
  ])
  await writeFile(resolve(outputDirectory, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`)
}

export const syncExamples = async outputDirectory => {
  await mkdir(outputDirectory, { recursive: true })
  const legacyEntries = await readdir(outputDirectory, { withFileTypes: true })
  await Promise.all([
    syncStoryboardExamples(resolve(outputDirectory, 'storyboard')),
    syncCharacterImageExamples(resolve(outputDirectory, 'character-image')),
    ...legacyEntries
      .filter(entry => entry.isFile() && (entry.name === manifestFile || extname(entry.name).toLowerCase() === '.shotdsl'))
      .map(entry => rm(resolve(outputDirectory, entry.name), { force: true }))
  ])
}
