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

const createInkMesh = (geometry, color, lineMaterial, ghostLineMaterial) => {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const edges = new THREE.EdgesGeometry(geometry, 18)
  const primary = new THREE.LineSegments(edges, lineMaterial)
  const echo = new THREE.LineSegments(edges, ghostLineMaterial)
  echo.scale.setScalar(1.009)
  mesh.add(primary, echo)
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
    this.outlineEffect = new OutlineEffect(this.renderer, {
      defaultThickness: 0.0045,
      defaultColor: [0.08, 0.08, 0.07],
      defaultAlpha: 0.82,
      defaultKeepAlive: true
    })
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#ebe8df')
    this.clock = new THREE.Clock()
    this.runtime = new Map()
    this.cameras = new Map()
    this.ir = null
    this.activeCamera = null
    this.currentTimeMs = 0
    this.onCameraChange = null
    this.loadGeneration = 0
    this.characterAssets = new CharacterAssetManager()
    this.assetWarnings = []
    this.lineMaterial = new THREE.LineBasicMaterial({ color: '#22231f', transparent: true, opacity: 0.9 })
    this.ghostLineMaterial = new THREE.LineBasicMaterial({ color: '#4d4b43', transparent: true, opacity: 0.22 })
    this.lineMaterial.userData.shared = true
    this.ghostLineMaterial.userData.shared = true
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
    this.scene.background.set('#ebe8df')
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

  addGround() {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: '#ddd9cf', roughness: 1 })
    )
    plane.rotation.x = -Math.PI / 2
    plane.position.y = -0.005
    plane.receiveShadow = true
    const grid = new THREE.GridHelper(30, 30, '#77766e', '#b8b5ac')
    grid.material.transparent = true
    grid.material.opacity = 0.34
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
      const rig = createHumanoid(entity.color, this.lineMaterial, this.ghostLineMaterial)
      rig.root.name = entity.id
      setTransform(rig.root, entity.transform)
      return { entity, object: rig.root, rig }
    }
  }

  addObject(entity) {
    const object = createInkMesh(geometryFor(entity), entity.color, this.lineMaterial, this.ghostLineMaterial)
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
    if (entity.type === 'ambient') light = new THREE.AmbientLight(entity.color, entity.intensity)
    else if (entity.type === 'hemisphere') light = new THREE.HemisphereLight(entity.color, '#858178', entity.intensity)
    else {
      light = new THREE.DirectionalLight(entity.color, entity.intensity)
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
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8f8a7f', 2.2))
    const key = new THREE.DirectionalLight('#fffaf1', 2.8)
    key.position.set(4, 8, 6)
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

  targetPoint(target) {
    if (!target) return new THREE.Vector3(0, 1, 0)
    if (target.kind === 'point') return new THREE.Vector3().fromArray(target.point)
    const runtime = this.runtime.get(target.entityId)
    if (!runtime) return new THREE.Vector3(0, 1, 0)
    const point = runtime.object.getWorldPosition(new THREE.Vector3())
    if (runtime.entity.kind === 'actor') point.y += target.bone === 'head' ? 1.72 : 1.05
    return point
  }

  resolveCamera(id) {
    const runtime = this.cameras.get(id) ?? this.cameras.values().next().value
    if (!runtime) return null
    const { camera, state } = runtime
    camera.fov = THREE.MathUtils.radToDeg(state.fov)
    camera.near = 0.03
    camera.updateProjectionMatrix()
    const target = this.targetPoint(state.target)

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
    return camera
  }

  seek(timeMs) {
    if (!this.ir) return
    this.currentTimeMs = Math.max(0, Math.min(this.ir.scene.durationMs, timeMs))
    const state = evaluateTimeline(this.ir, this.currentTimeMs)
    this.resetRuntime()
    for (const [target, value] of state.values) this.applyValue(target, value)
    for (const [actorId, actor] of this.runtime) {
      if (actor.entity.kind !== 'actor') continue
      const clip = state.clips.get(actorId) ?? { clip: 'idle', elapsedMs: this.currentTimeMs, loop: true, blendMs: 0 }
      if (actor.character) actor.character.sample(clip)
      else if (actor.rig) applyProceduralClip(actor.rig, clip)
    }
    this.scene.updateMatrixWorld(true)
    const previousCamera = this.activeCamera?.name
    this.activeCamera = this.resolveCamera(state.activeCameraId)
    if (previousCamera !== this.activeCamera?.name) this.onCameraChange?.(this.activeCamera?.name ?? '—')
    this.render()
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
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      entities: this.runtime.size,
      skinnedActors: characters.length,
      humanActors: characters.filter(runtime => runtime.character.metrics.proportion === 'human-realistic').length,
      characterModels: [...new Set(characters.map(runtime => runtime.character.metrics.modelId))].sort(),
      characterMetrics: characters.map(runtime => ({ actorId: runtime.entity.id, ...runtime.character.metrics })),
      characterSamples: characters.map(runtime => ({ actorId: runtime.entity.id, actions: runtime.character.lastSample ?? [] })),
      fallbackActors: [...this.runtime.values()].filter(runtime => runtime.rig).length
    }
  }
}
