import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { CHARACTER_CATALOG, getModelAction, resolveModel } from '../shotdsl/catalog.js'

export { CHARACTER_CATALOG }

const normalizedClipTime = (clip, elapsedMs, loop) => {
  const seconds = Math.max(0, elapsedMs / 1000)
  if (clip.duration <= 0) return 0
  return loop ? seconds % clip.duration : Math.min(seconds, Math.max(0, clip.duration - 1 / 120))
}

const storyboardMaterial = material => {
  const result = material.clone()
  if (result.color) result.color.set('#e8e8e3')
  if ('roughness' in result) result.roughness = 1
  if ('metalness' in result) result.metalness = 0
  result.map = null
  result.normalMap = null
  result.roughnessMap = null
  result.metalnessMap = null
  result.wireframe = false
  if (!material.side || material.side === THREE.FrontSide) result.side = THREE.FrontSide
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
  constructor(template) {
    this.config = template.config
    this.model = SkeletonUtils.clone(template.scene)
    this.mixer = new THREE.AnimationMixer(this.model)
    this.clips = new Map(template.animations.map(clip => [clip.name, clip]))
    this.actions = new Map()
    this.morphTargets = []
    this.lastSample = null
    this.model.traverse(child => {
      if (child.geometry) child.geometry.userData.assetShared = true
      if (!child.isMesh) return
      if (child.morphTargetDictionary && child.morphTargetInfluences) this.morphTargets.push(child)
      child.castShadow = true
      child.receiveShadow = true
      child.frustumCulled = false
      if (Array.isArray(child.material)) child.material = child.material.map(storyboardMaterial)
      else child.material = storyboardMaterial(child.material)
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
      fidelity: this.config.fidelity ?? 'stylized',
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

  resolveBone(semanticName) {
    return this.model.getObjectByName(this.config.bones?.[semanticName] ?? semanticName)
  }

  resolveClip(semanticName) {
    const mapping = getModelAction(this.config.id, semanticName)
    if (!mapping) throw new Error(`Character '${this.config.id}' does not support action '${semanticName}'`)
    const clip = this.clips.get(mapping.asset)
    if (!clip) throw new Error(`Character '${this.config.id}' catalog references missing clip '${mapping.asset}'`)
    return { clip, mapping }
  }

  actionFor(clip) {
    if (!this.actions.has(clip.name)) this.actions.set(clip.name, this.mixer.clipAction(clip))
    return this.actions.get(clip.name)
  }

  configureAction(sample, weight) {
    if (weight <= 0) return null
    const { clip, mapping } = this.resolveClip(sample.clip)
    const action = this.actionFor(clip)
    action.reset()
    action.enabled = true
    action.clampWhenFinished = !sample.loop
    action.setLoop(sample.loop ? THREE.LoopRepeat : THREE.LoopOnce, sample.loop ? Infinity : 1)
    action.setEffectiveTimeScale(1)
    action.setEffectiveWeight(weight)
    action.play()
    action.time = normalizedClipTime(clip, sample.elapsedMs, sample.loop)
    return { semantic: sample.clip, asset: clip.name, time: action.time, weight, overlay: mapping.overlay }
  }

  resetSpeechMorphs() {
    for (const mesh of this.morphTargets) {
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
        if (/jawopen|mouthopen|viseme_aa|viseme_oh/i.test(name)) mesh.morphTargetInfluences[index] = 0
      }
    }
  }

  applyOverlay(sample) {
    if (!sample.overlay || sample.weight <= 0) return
    const phase = sample.time * Math.PI * 2
    const head = this.resolveBone('head')
    const upperArmLeft = this.resolveBone('upper_arm_l')
    const upperArmRight = this.resolveBone('upper_arm_r')
    const lowerArmRight = this.resolveBone('lower_arm_r')
    if (sample.overlay === 'talk') {
      if (head) {
        head.rotation.y += Math.sin(phase * 0.47) * 0.06 * sample.weight
        head.rotation.x += Math.sin(phase * 0.91) * 0.025 * sample.weight
      }
      if (upperArmLeft) upperArmLeft.rotation.z -= (0.1 + Math.sin(phase * 0.73) * 0.08) * sample.weight
      if (upperArmRight) upperArmRight.rotation.z += (0.1 + Math.sin(phase * 0.61) * 0.08) * sample.weight
      const mouth = 0.15 + Math.abs(Math.sin(phase * 1.7)) * 0.55
      for (const mesh of this.morphTargets) {
        for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
          if (/jawopen|mouthopen|viseme_aa|viseme_oh/i.test(name)) mesh.morphTargetInfluences[index] = mouth * sample.weight
        }
      }
    } else if (sample.overlay === 'reach') {
      const reach = Math.sin(Math.min(1, sample.time / 0.8) * Math.PI / 2) * sample.weight
      if (upperArmRight) upperArmRight.rotation.x -= 1.15 * reach
      if (upperArmRight) upperArmRight.rotation.z += 0.2 * reach
      if (lowerArmRight) lowerArmRight.rotation.x += 0.25 * reach
    } else if (sample.overlay === 'look-around' && head) {
      head.rotation.y += Math.sin(phase * 0.32) * 0.48 * sample.weight
      head.rotation.x += Math.sin(phase * 0.19) * 0.08 * sample.weight
    }
  }

  applyGaze(target, strength = 1) {
    const head = this.resolveBone('head')
    if (!head?.parent) return false
    const headPosition = head.getWorldPosition(new THREE.Vector3())
    const direction = target.clone().sub(headPosition)
    if (direction.lengthSq() < 0.000001) return false
    const parentWorldRotation = head.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
    direction.applyQuaternion(parentWorldRotation).normalize()
    const yaw = Math.atan2(direction.x, Math.max(0.0001, direction.z))
    const pitch = -Math.atan2(direction.y, Math.max(0.0001, Math.hypot(direction.x, direction.z)))
    const clampedYaw = THREE.MathUtils.clamp(yaw, -0.75, 0.75) * strength
    const clampedPitch = THREE.MathUtils.clamp(pitch, -0.4, 0.4) * strength
    head.rotation.y += clampedYaw
    head.rotation.x += clampedPitch
    const neck = this.resolveBone('neck')
    if (neck) {
      neck.rotation.y += clampedYaw * 0.35
      neck.rotation.x += clampedPitch * 0.3
    }
    const eyeL = this.resolveBone('eye_l')
    const eyeR = this.resolveBone('eye_r')
    if (eyeL) eyeL.rotation.y = THREE.MathUtils.clamp(yaw, -0.35, 0.35) * strength
    if (eyeR) eyeR.rotation.y = THREE.MathUtils.clamp(yaw, -0.35, 0.35) * strength
    head.updateMatrixWorld(true)
    return true
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
    this.resetSpeechMorphs()
    for (const sample of sampled) this.applyOverlay(sample)
    this.model.updateMatrixWorld(true)
    this.lastSample = sampled.map(({ overlay, ...sample }) => sample)
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
    const resolved = resolveModel(modelId)
    const config = resolved?.definition
    if (!config) throw new Error(`Unknown character asset '${modelId}'`)
    if (!this.templates.has(config.url)) {
      this.templates.set(config.url, this.loadTemplate(config))
    }
    return this.templates.get(config.url)
  }

  async loadTemplate(config) {
    const gltf = await this.loader.loadAsync(config.url)
    return { scene: gltf.scene, animations: gltf.animations, config }
  }

  async instantiate(entity) {
    const template = await this.load(entity.model)
    return new CharacterRuntime(template)
  }
}
