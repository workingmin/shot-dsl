import * as THREE from 'three'
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js'
import { evaluateTimeline } from '../timeline.js'
import { CharacterAssetManager } from './character-runtime.js'
import { applyProceduralClip, createHumanoid } from './humanoid.js'

const clone = value => structuredClone(value)

const setTransform = (object, transform) => {
  object.position.fromArray(transform.position)
  object.rotation.set(...transform.rotation, 'XYZ')
  object.scale.fromArray(transform.scale)
  object.visible = transform.visibility
}

const geometryFor = entity => {
  if (entity.primitive === 'sphere') return new THREE.SphereGeometry(entity.radius, 16, 10)
  if (entity.primitive === 'cylinder') return new THREE.CylinderGeometry(entity.radius, entity.radius, entity.height, 12)
  if (entity.primitive === 'cone') return new THREE.ConeGeometry(entity.radius, entity.height, 12)
  return new THREE.BoxGeometry(...entity.size)
}

const createPrimitiveMesh = (geometry, lineMaterial) => {
  const material = new THREE.MeshStandardMaterial({
    color: '#eeeeea',
    roughness: 1,
    metalness: 0,
    flatShading: true
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const edges = new THREE.EdgesGeometry(geometry, 18)
  mesh.add(new THREE.LineSegments(edges, lineMaterial))
  return mesh
}

const disposeObject = object => {
  object.traverse(child => {
    if (child.geometry && !child.geometry.userData.assetShared) child.geometry.dispose?.()
    if (Array.isArray(child.material)) child.material.filter(material => !material.userData.shared).forEach(material => material.dispose?.())
    else if (child.material && !child.material.userData.shared) child.material.dispose?.()
  })
}

export class ShotPlayer {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.outlineEffect = new OutlineEffect(this.renderer, {
      defaultThickness: 0.0045,
      defaultColor: [0.035, 0.035, 0.035],
      defaultAlpha: 0.94,
      defaultKeepAlive: true
    })
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#f7f7f4')
    this.runtime = new Map()
    this.cameras = new Map()
    this.ir = null
    this.activeCamera = null
    this.cameraDebug = null
    this.lastTimelineState = null
    this.currentTimeMs = 0
    this.onCameraChange = null
    this.loadGeneration = 0
    this.characterAssets = new CharacterAssetManager()
    this.assetWarnings = []
    this.renderStyle = 'storyboard'
    this.lineMaterial = new THREE.LineBasicMaterial({ color: '#171714', transparent: true, opacity: 0.92 })
    this.lineMaterial.userData.shared = true
    this.resizeObserver = new ResizeObserver(() => this.render())
    this.resizeObserver.observe(canvas.parentElement)
  }

  clear() {
    for (const runtime of this.runtime.values()) runtime.character?.dispose()
    for (const child of [...this.scene.children]) {
      this.scene.remove(child)
      disposeObject(child)
    }
    this.runtime.clear()
    this.cameras.clear()
  }
  cancelPendingLoad() {
    this.loadGeneration += 1
  }

  async load(ir) {
    const generation = ++this.loadGeneration
    this.clear()
    this.ir = ir
    this.assetWarnings = []
    this.configureRenderStyle(ir.scene.style)
    this.addGround()

    let hasLight = false
    const actorPromises = []
    for (const entity of Object.values(ir.entities)) {
      if (entity.kind === 'actor') actorPromises.push(this.createActor(entity))
      else if (entity.kind === 'object') this.addObject(entity)
      else if (entity.kind === 'camera') this.addCamera(entity)
      else if (entity.kind === 'light') { this.addLight(entity); hasLight = true }
    }
    if (!hasLight) this.addDefaultLights()
    const actors = await Promise.all(actorPromises)
    if (generation !== this.loadGeneration) {
      for (const runtime of actors) runtime.character?.dispose()
      return false
    }
    for (const runtime of actors) {
      this.scene.add(runtime.object)
      this.runtime.set(runtime.entity.id, runtime)
    }
    this.seek(0)
    return true
  }

  configureRenderStyle(style) {
    this.renderStyle = style === 'storyboard' ? style : 'storyboard'
    this.scene.background.set('#f7f7f4')
    this.scene.environment = null
    this.scene.fog = null
    this.renderer.toneMapping = THREE.NoToneMapping
  }

  addGround() {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({
        color: '#f0f0ec',
        roughness: 1,
        metalness: 0
      })
    )
    plane.rotation.x = -Math.PI / 2
    plane.position.y = -0.005
    plane.receiveShadow = true
    const grid = new THREE.GridHelper(30, 30, '#777772', '#c3c3bd')
    grid.material.transparent = true
    grid.material.opacity = 0.28
    this.scene.add(plane, grid)
  }

  async createActor(entity) {
    try {
      const character = await this.characterAssets.instantiate(entity)
      const root = new THREE.Group()
      root.name = entity.id
      root.add(character.model)
      setTransform(root, entity.transform)
      return { entity, object: root, character }
    } catch (error) {
      this.assetWarnings.push(`${entity.id}: ${error.message}; using procedural fallback`)
      const rig = createHumanoid('#deded8', this.lineMaterial, this.lineMaterial)
      rig.root.name = entity.id
      setTransform(rig.root, entity.transform)
      return { entity, object: rig.root, rig }
    }
  }

  addObject(entity) {
    const object = createPrimitiveMesh(geometryFor(entity), this.lineMaterial)
    object.name = entity.id
    setTransform(object, entity.transform)
    this.scene.add(object)
    this.runtime.set(entity.id, { entity, object })
  }

  addCamera(entity) {
    const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(entity.fov), 16 / 9, 0.03, 200)
    camera.name = entity.id
    this.scene.add(camera)
    this.cameras.set(entity.id, { entity, camera, state: clone(entity) })
    this.runtime.set(entity.id, { entity, object: camera })
  }

  addLight(entity) {
    let light
    if (entity.type === 'ambient') light = new THREE.AmbientLight('#ffffff', entity.intensity)
    else if (entity.type === 'hemisphere') light = new THREE.HemisphereLight('#ffffff', '#a9a9a3', entity.intensity)
    else {
      light = new THREE.DirectionalLight('#ffffff', entity.intensity)
      light.position.fromArray(entity.position)
      light.castShadow = true
      light.shadow.mapSize.set(1024, 1024)
      light.shadow.camera.left = -8
      light.shadow.camera.right = 8
      light.shadow.camera.top = 8
      light.shadow.camera.bottom = -8
    }
    this.scene.add(light)
  }

  addDefaultLights() {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#a9a9a3', 2.1))
    const key = new THREE.DirectionalLight('#ffffff', 2.4)
    key.position.set(4.5, 8, 5.5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -8
    key.shadow.camera.right = 8
    key.shadow.camera.top = 8
    key.shadow.camera.bottom = -8
    this.scene.add(key)
  }

  resetRuntime() {
    for (const [id, runtime] of this.runtime) {
      if (runtime.entity.kind === 'camera') continue
      setTransform(runtime.object, runtime.entity.transform)
      if (runtime.rig) applyProceduralClip(runtime.rig, null)
      runtime.object.updateMatrixWorld(true)
    }
    for (const cameraRuntime of this.cameras.values()) cameraRuntime.state = clone(cameraRuntime.entity)
  }

  applyValue(target, value) {
    const separator = target.lastIndexOf('.')
    const id = target.slice(0, separator)
    const property = target.slice(separator + 1)
    const runtime = this.runtime.get(id)
    if (!runtime) return
    if (runtime.entity.kind === 'camera') {
      const state = this.cameras.get(id).state
      if (property === 'rotation') state.transform.rotationQuaternion = value
      else if (['position', 'scale', 'visibility'].includes(property)) state.transform[property] = value
      else state[property] = value
      return
    }
    if (property === 'position') runtime.object.position.fromArray(value)
    else if (property === 'rotation') runtime.object.quaternion.fromArray(value)
    else if (property === 'scale') runtime.object.scale.fromArray(value)
    else if (property === 'visibility') runtime.object.visible = value
  }

  resolveTargetPoint(target) {
    if (!target) return { point: new THREE.Vector3(0, 1, 0), boneResolved: false }
    if (target.kind === 'point') return { point: new THREE.Vector3().fromArray(target.point), boneResolved: false }
    const runtime = this.runtime.get(target.entityId)
    if (!runtime) return { point: new THREE.Vector3(0, 1, 0), boneResolved: false }
    if (target.bone && runtime.character) {
      const bone = runtime.character.resolveBone(target.bone)
      if (bone) return { point: bone.getWorldPosition(new THREE.Vector3()), boneResolved: true }
    }
    const point = runtime.object.getWorldPosition(new THREE.Vector3())
    if (runtime.entity.kind === 'actor') point.y += target.bone === 'head' ? 1.72 : 1.05
    return { point, boneResolved: false }
  }

  targetPoint(target) {
    return this.resolveTargetPoint(target).point
  }

  applyGaze(actorId, gaze) {
    const runtime = this.runtime.get(actorId)
    if (!runtime || runtime.entity.kind !== 'actor') return false
    const target = this.targetPoint(gaze.target)
    if (runtime.character) return runtime.character.applyGaze(target, gaze.strength)
    if (!runtime.rig) return false
    const localTarget = runtime.object.worldToLocal(target.clone())
    const direction = localTarget.sub(runtime.rig.headPivot.position)
    runtime.rig.headPivot.rotation.y += THREE.MathUtils.clamp(Math.atan2(direction.x, Math.max(0.0001, direction.z)), -0.75, 0.75) * gaze.strength
    runtime.rig.headPivot.rotation.x += THREE.MathUtils.clamp(-Math.atan2(direction.y, Math.max(0.0001, Math.hypot(direction.x, direction.z))), -0.4, 0.4) * gaze.strength
    return true
  }

  resolveCamera(id) {
    const runtime = this.cameras.get(id) ?? this.cameras.values().next().value
    if (!runtime) return null
    const { camera, state } = runtime
    camera.fov = THREE.MathUtils.radToDeg(state.fov)
    camera.near = 0.03
    camera.updateProjectionMatrix()
    const target = this.targetPoint(state.target)
    this.cameraDebug = { mode: state.mode, cameraId: id, boneTargetsResolved: 0 }

    if (state.mode === 'follow') {
      camera.position.copy(target).add(new THREE.Vector3().fromArray(state.offset))
      camera.lookAt(target)
    } else if (state.mode === 'orbit') {
      const horizontal = Math.cos(state.elevation) * state.radius
      camera.position.set(
        target.x + Math.sin(state.azimuth) * horizontal,
        target.y + Math.sin(state.elevation) * state.radius,
        target.z + Math.cos(state.azimuth) * horizontal
      )
      camera.lookAt(target)
    } else {
      camera.position.fromArray(state.transform.position)
      if (state.mode === 'lookAt') camera.lookAt(target)
      else if (state.transform.rotationQuaternion) camera.quaternion.fromArray(state.transform.rotationQuaternion)
      else camera.rotation.set(...state.transform.rotation, 'XYZ')
    }
    const shake = state.shake ?? 0
    if (shake > 0) {
      const seconds = this.currentTimeMs / 1000
      const seed = this.ir?.scene.seed ?? 1
      camera.translateX(Math.sin(seconds * 17.3 + seed * 0.17) * shake)
      camera.translateY(Math.sin(seconds * 23.7 + seed * 0.31) * shake * 0.62)
    }
    camera.rotateZ((state.roll ?? 0) + Math.sin(this.currentTimeMs / 1000 * 13.1 + (this.ir?.scene.seed ?? 1)) * shake * 0.08)
    this.cameraDebug = { ...this.cameraDebug, shake, roll: state.roll ?? 0, renderStyle: this.renderStyle }
    return camera
  }

  seek(timeMs) {
    if (!this.ir) return
    this.currentTimeMs = Math.max(0, Math.min(this.ir.scene.durationMs, timeMs))
    const state = evaluateTimeline(this.ir, this.currentTimeMs)
    this.lastTimelineState = state
    this.resetRuntime()
    for (const [target, value] of state.values) this.applyValue(target, value)
    for (const [actorId, actor] of this.runtime) {
      if (actor.entity.kind !== 'actor') continue
      const clip = state.clips.get(actorId) ?? { clip: 'idle', elapsedMs: this.currentTimeMs, loop: true, blendMs: 0 }
      if (actor.character) actor.character.sample(clip)
      else if (actor.rig) applyProceduralClip(actor.rig, clip)
    }
    this.scene.updateMatrixWorld(true)
    for (const [actorId, gaze] of state.gazes) this.applyGaze(actorId, gaze)
    this.scene.updateMatrixWorld(true)
    for (const [objectId, attach] of state.attachments) this.applyAttach(objectId, attach)
    for (const [actorId, ik] of state.ikConstraints) this.applyIK(actorId, ik)
    this.scene.updateMatrixWorld(true)
    const previousCamera = this.activeCamera?.name
    this.activeCamera = this.resolveCamera(state.activeCameraId)
    if (previousCamera !== this.activeCamera?.name) this.onCameraChange?.(this.activeCamera?.name ?? '—')
    this.render()
  }

  applyAttach(objectId, attach) {
    const objectRuntime = this.runtime.get(objectId)
    const actorRuntime = this.runtime.get(attach.actorId)
    if (!objectRuntime || !actorRuntime) return
    if (actorRuntime.character) {
      const bone = actorRuntime.character.resolveBone(attach.bone)
      if (bone) {
        const bonePosition = bone.getWorldPosition(new THREE.Vector3())
        const boneQuaternion = bone.getWorldQuaternion(new THREE.Quaternion())
        objectRuntime.object.position.copy(bonePosition)
        objectRuntime.object.quaternion.copy(boneQuaternion)
        objectRuntime.object.position.add(new THREE.Vector3().fromArray(attach.offset).applyQuaternion(boneQuaternion))
        objectRuntime.object.updateMatrixWorld(true)
        return
      }
    }
    const actorRoot = actorRuntime.object
    const actorPosition = actorRoot.getWorldPosition(new THREE.Vector3())
    objectRuntime.object.position.copy(actorPosition).add(new THREE.Vector3(0, attach.bone === 'head' ? 1.5 : 0.9, 0)).add(new THREE.Vector3().fromArray(attach.offset))
    objectRuntime.object.updateMatrixWorld(true)
  }

  applyIK(actorId, ik) {
    const actorRuntime = this.runtime.get(actorId)
    if (!actorRuntime?.character) return
    const effectorBone = actorRuntime.character.resolveBone(ik.effector)
    if (!effectorBone?.parent) return
    const target = this.targetPoint(ik.target)
    const weight = ik.weight
    const chain = []
    let current = effectorBone
    for (let i = 0; i < 4 && current?.parent; i += 1) {
      chain.unshift(current)
      current = current.parent
    }
    if (chain.length < 2) return
    for (let iteration = 0; iteration < 5; iteration += 1) {
      for (let i = chain.length - 1; i >= 0; i -= 1) {
        const bone = chain[i]
        const effectorWorld = effectorBone.getWorldPosition(new THREE.Vector3())
        const boneWorld = bone.getWorldPosition(new THREE.Vector3())
        const toEffector = effectorWorld.clone().sub(boneWorld).normalize()
        const toTarget = target.clone().sub(boneWorld)
        if (toTarget.lengthSq() < 0.0001) continue
        toTarget.normalize()
        const rotation = new THREE.Quaternion().setFromUnitVectors(toEffector, toTarget)
        const localRotation = bone.parent?.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation).multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())) ?? rotation
        const blended = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), localRotation, weight * 0.3)
        bone.quaternion.multiply(blended)
        bone.updateMatrixWorld(true)
      }
    }
    actorRuntime.character.model.updateMatrixWorld(true)
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth)
    const height = Math.max(1, this.canvas.clientHeight)
    const pixelRatio = this.renderer.getPixelRatio()
    if (this.canvas.width !== Math.floor(width * pixelRatio) || this.canvas.height !== Math.floor(height * pixelRatio)) {
      this.renderer.setSize(width, height, false)
      this.outlineEffect.setSize(width, height)
    }
    if (this.activeCamera) {
      this.activeCamera.aspect = width / height
      this.activeCamera.updateProjectionMatrix()
    }
  }

  render() {
    if (!this.activeCamera) return
    this.resize()
    this.outlineEffect.render(this.scene, this.activeCamera)
  }

  exportFrame() {
    this.render()
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas export failed')), 'image/png')
    })
  }

  getStats() {
    const characters = [...this.runtime.values()].filter(runtime => runtime.character)
    const activeAttachments = this.lastTimelineState?.attachments ? [...this.lastTimelineState.attachments.keys()] : []
    const activeIK = this.lastTimelineState?.ikConstraints ? [...this.lastTimelineState.ikConstraints.keys()] : []
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      entities: this.runtime.size,
      skinnedActors: characters.length,
      storyboardActors: characters.filter(runtime => runtime.character.metrics.fidelity === 'storyboard-proxy').length,
      renderStyle: this.renderStyle,
      characterModels: [...new Set(characters.map(runtime => runtime.character.metrics.modelId))].sort(),
      characterMetrics: characters.map(runtime => ({ actorId: runtime.entity.id, ...runtime.character.metrics })),
      characterSamples: characters.map(runtime => ({ actorId: runtime.entity.id, actions: runtime.character.lastSample ?? [] })),
      activeGazes: this.lastTimelineState ? [...this.lastTimelineState.gazes.keys()] : [],
      activeAttachments,
      activeIKConstraints: activeIK,
      activeNotes: this.lastTimelineState?.notes?.map(note => note.text) ?? [],
      activeCameraFrame: this.cameraDebug,
      fallbackActors: [...this.runtime.values()].filter(runtime => runtime.rig).length
    }
  }
}
