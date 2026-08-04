import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'

export const CHARACTER_CATALOG = {
  'human-mannequin': {
    id: 'human-mannequin',
    url: '/assets/characters/HumanMannequin.glb',
    label: 'Human Mannequin · Mesh2Motion / Quaternius · CC0',
    proportion: 'human-realistic',
    authoredBounds: { minY: -0.0003856996, maxY: 1.8291784525 },
    clips: {
      idle: 'Idle_A',
      guard: 'Fighting Idle',
      walk: 'Walk',
      run: 'Sprint',
      punch: 'Punch_Jab',
      cross: 'Punch_Cross',
      hook: 'Melee_Hook',
      // Kept as a v0.1 compatibility alias until a retargeted kick is added.
      kick: 'Melee_Hook',
      'hit-face': 'Hit_Head',
      fall: 'Death_D'
    },
    contacts: {
      punch: {
        impactTimeMs: 292,
        effectorBone: 'hand_l',
        targetBone: 'head',
        responseClip: 'hit-face'
      }
    }
  },
  'robot-expressive': {
    id: 'robot-expressive',
    url: '/assets/characters/RobotExpressive.glb',
    label: 'Robot Expressive · CC0',
    authoredBounds: { minY: -0.0203044343, maxY: 4.7711189772 },
    clips: {
      idle: 'Idle',
      guard: 'Idle',
      walk: 'Walking',
      run: 'Running',
      punch: 'Punch',
      cross: 'Punch',
      hook: 'Punch',
      kick: 'Jump',
      'hit-face': 'No',
      fall: 'Death'
    }
  },
  humanoid: { alias: 'human-mannequin' },
  'humanoid-male': { alias: 'human-mannequin' },
  'humanoid-female': { alias: 'human-mannequin' }
}

const resolveCatalogEntry = modelId => {
  const entry = CHARACTER_CATALOG[modelId]
  if (!entry) return null
  return entry.alias ? CHARACTER_CATALOG[entry.alias] : entry
}

const normalizedClipTime = (clip, elapsedMs, loop) => {
  const seconds = Math.max(0, elapsedMs / 1000)
  if (clip.duration <= 0) return 0
  return loop ? seconds % clip.duration : Math.min(seconds, Math.max(0, clip.duration - 1 / 120))
}

const tintMaterial = (material, tint) => {
  const result = material.clone()
  if (result.color) result.color.lerp(tint, 0.62)
  if ('roughness' in result) result.roughness = 1
  if ('metalness' in result) result.metalness = 0
  result.side = THREE.FrontSide
  return result
}

const measureCharacterBounds = model => {
  const bounds = new THREE.Box3().makeEmpty()
  const partBounds = new THREE.Box3()
  model.updateMatrixWorld(true)
  model.traverse(child => {
    if (!child.isMesh || !child.geometry) return
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
    partBounds.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld)
    bounds.union(partBounds)
  })
  return bounds
}

export class CharacterRuntime {
  constructor(template, entity) {
    this.config = template.config
    this.model = SkeletonUtils.clone(template.scene)
    this.mixer = new THREE.AnimationMixer(this.model)
    this.clips = new Map(template.animations.map(clip => [clip.name, clip]))
    this.actions = new Map()
    this.lastSample = null
    const tint = new THREE.Color(entity.color)

    this.model.traverse(child => {
      if (child.geometry) child.geometry.userData.assetShared = true
      if (!child.isMesh) return
      child.castShadow = true
      child.receiveShadow = true
      child.frustumCulled = false
      if (Array.isArray(child.material)) child.material = child.material.map(material => tintMaterial(material, tint))
      else child.material = tintMaterial(child.material, tint)
    })

    // Measure the authored mesh envelope before sampling animation. This avoids
    // the inverse-bind expansion produced by Box3.setFromObject on some rigs.
    const measuredBounds = measureCharacterBounds(this.model)
    const measuredHeight = measuredBounds.max.y - measuredBounds.min.y
    const useMeasuredBounds = !measuredBounds.isEmpty() && Number.isFinite(measuredHeight) && measuredHeight > 0.2 && measuredHeight < 20
    const bounds = useMeasuredBounds
      ? measuredBounds
      : new THREE.Box3(
          new THREE.Vector3(0, this.config.authoredBounds?.minY ?? 0, 0),
          new THREE.Vector3(0, this.config.authoredBounds?.maxY ?? 1.78, 0)
        )
    const height = bounds.max.y - bounds.min.y
    const normalizationScale = height > 0 ? 1.78 / height : 1
    this.metrics = {
      modelId: this.config.id,
      proportion: this.config.proportion ?? 'stylized',
      sourceHeight: height,
      normalizedHeight: 1.78,
      normalizationScale,
      sourceMinY: bounds.min.y,
      sourceMaxY: bounds.max.y
    }
    this.model.scale.setScalar(normalizationScale)
    this.model.position.y = -bounds.min.y * normalizationScale
    this.model.updateMatrixWorld(true)
  }

  resolveClip(semanticName) {
    const assetName = this.config.clips[semanticName] ?? semanticName
    return this.clips.get(assetName) ?? this.clips.get('Idle_A') ?? this.clips.get('Idle') ?? this.clips.values().next().value
  }

  actionFor(clip) {
    if (!this.actions.has(clip.name)) this.actions.set(clip.name, this.mixer.clipAction(clip))
    return this.actions.get(clip.name)
  }

  configureAction(sample, weight) {
    const clip = this.resolveClip(sample.clip)
    if (!clip || weight <= 0) return null
    const action = this.actionFor(clip)
    action.reset()
    action.enabled = true
    action.clampWhenFinished = !sample.loop
    action.setLoop(sample.loop ? THREE.LoopRepeat : THREE.LoopOnce, sample.loop ? Infinity : 1)
    action.setEffectiveTimeScale(1)
    action.setEffectiveWeight(weight)
    action.play()
    action.time = normalizedClipTime(clip, sample.elapsedMs, sample.loop)
    return { semantic: sample.clip, asset: clip.name, time: action.time, weight }
  }

  sample(clipState) {
    const current = clipState ?? { clip: 'idle', elapsedMs: 0, loop: true, blendMs: 0 }
    const blendAlpha = current.previous && current.blendMs > 0
      ? Math.max(0, Math.min(1, current.elapsedMs / current.blendMs))
      : 1

    this.mixer.stopAllAction()
    const sampled = []
    if (current.previous && blendAlpha < 1) {
      const previousSample = this.configureAction(current.previous, 1 - blendAlpha)
      if (previousSample) sampled.push(previousSample)
    }
    const currentSample = this.configureAction(current, blendAlpha)
    if (currentSample) sampled.push(currentSample)
    this.mixer.update(0)
    this.model.updateMatrixWorld(true)
    this.lastSample = sampled
  }

  dispose() {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.model)
    this.model.traverse(child => {
      if (child.isSkinnedMesh) child.skeleton.dispose()
    })
  }
}

export class CharacterAssetManager {
  constructor() {
    this.loader = new GLTFLoader()
    this.templates = new Map()
  }

  async load(modelId) {
    const config = resolveCatalogEntry(modelId)
    if (!config) throw new Error(`Unknown character asset '${modelId}'`)
    if (!this.templates.has(config.url)) {
      this.templates.set(config.url, this.loader.loadAsync(config.url).then(gltf => ({
        scene: gltf.scene,
        animations: gltf.animations,
        config
      })))
    }
    return this.templates.get(config.url)
  }

  async instantiate(entity) {
    const template = await this.load(entity.model)
    return new CharacterRuntime(template, entity)
  }
}
