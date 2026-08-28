import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const VIEW_DIRECTIONS = {
  front: new THREE.Vector3(0, 0, 1),
  left: new THREE.Vector3(-1, 0, 0),
  back: new THREE.Vector3(0, 0, -1)
}

const disposeMaterial = material => {
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose()
  }
  material.dispose()
}

const disposeModel = model => {
  model.traverse(child => {
    child.geometry?.dispose?.()
    if (Array.isArray(child.material)) child.material.forEach(disposeMaterial)
    else if (child.material) disposeMaterial(child.material)
  })
}

const countModelResources = model => {
  let triangles = 0
  const materials = new Set()
  const textures = new Set()
  model.traverse(child => {
    if (!child.isMesh || !child.geometry) return
    const indexCount = child.geometry.index?.count ?? child.geometry.attributes.position?.count ?? 0
    triangles += Math.floor(indexCount / 3)
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of childMaterials.filter(Boolean)) {
      materials.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    }
  })
  return { triangles, materials: materials.size, textures: textures.size }
}

export class CharacterImageRenderer {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#e9eeeb')
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100)
    this.camera.position.set(2.8, 1.45, 4.6)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 1.2
    this.controls.maxDistance = 12
    this.controls.target.set(0, 0.92, 0)

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.environmentTarget = pmrem.fromScene(room, 0.04)
    this.scene.environment = this.environmentTarget.texture
    room.dispose()
    pmrem.dispose()

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#909a92', 1.6))
    const key = new THREE.DirectionalLight('#fff7ef', 3.2)
    key.position.set(3.6, 5.8, 4.2)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = -3
    key.shadow.camera.right = 3
    key.shadow.camera.top = 3
    key.shadow.camera.bottom = -3
    this.scene.add(key)
    const fill = new THREE.DirectionalLight('#d8e7ff', 1.1)
    fill.position.set(-4, 2.8, 2)
    this.scene.add(fill)

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: '#eef1ed', roughness: 0.92, metalness: 0 })
    )
    this.floor.rotation.x = -Math.PI / 2
    this.floor.position.y = -0.004
    this.floor.receiveShadow = true
    this.scene.add(this.floor)

    this.loader = new GLTFLoader()
    this.model = null
    this.modelBounds = null
    this.modelMetrics = null
    this.view = 'free'
    this.loadRevision = 0
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement)
    this.animationFrame = requestAnimationFrame(() => this.animate())
  }

  animate() {
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.animationFrame = requestAnimationFrame(() => this.animate())
  }

  resize() {
    const width = Math.max(1, this.canvas.parentElement.clientWidth)
    const height = Math.max(1, this.canvas.parentElement.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  async loadModel(url) {
    const revision = ++this.loadRevision
    const gltf = await this.loader.loadAsync(url)
    if (revision !== this.loadRevision) {
      disposeModel(gltf.scene)
      return null
    }

    gltf.scene.traverse(child => {
      if (!child.isMesh) return
      child.castShadow = true
      child.receiveShadow = true
      child.frustumCulled = false
    })
    const sourceBounds = new THREE.Box3().setFromObject(gltf.scene)
    const sourceSize = sourceBounds.getSize(new THREE.Vector3())
    if (!Number.isFinite(sourceSize.y) || sourceSize.y <= 0.01) throw new Error('人物模型尺寸无效')
    const scale = 1.8 / sourceSize.y
    gltf.scene.scale.multiplyScalar(scale)
    gltf.scene.updateMatrixWorld(true)
    const normalizedBounds = new THREE.Box3().setFromObject(gltf.scene)
    const center = normalizedBounds.getCenter(new THREE.Vector3())
    gltf.scene.position.add(new THREE.Vector3(-center.x, -normalizedBounds.min.y, -center.z))
    gltf.scene.updateMatrixWorld(true)

    if (this.model) {
      this.scene.remove(this.model)
      disposeModel(this.model)
    }
    this.model = gltf.scene
    this.modelBounds = new THREE.Box3().setFromObject(this.model)
    this.modelMetrics = {
      ...countModelResources(this.model),
      animations: gltf.animations.length,
      heightM: this.modelBounds.max.y - this.modelBounds.min.y
    }
    this.scene.add(this.model)
    this.setView('free', true)
    return this.modelMetrics
  }

  frameDistance() {
    const height = this.modelBounds ? this.modelBounds.max.y - this.modelBounds.min.y : 1.8
    return height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.22
  }

  setView(view, resetFree = false) {
    if (!this.modelBounds) return
    this.view = view
    const height = this.modelBounds.max.y - this.modelBounds.min.y
    const target = new THREE.Vector3(0, this.modelBounds.min.y + height * 0.5, 0)
    this.controls.target.copy(target)
    if (view === 'free') {
      this.controls.enabled = true
      if (resetFree) this.camera.position.set(this.frameDistance() * 0.56, target.y + height * 0.08, this.frameDistance())
    } else {
      this.controls.enabled = false
      this.camera.position.copy(VIEW_DIRECTIONS[view]).multiplyScalar(this.frameDistance()).add(target)
    }
    this.camera.lookAt(target)
    this.camera.updateMatrixWorld(true)
    this.controls.update()
  }

  async exportTurnaround(viewSize = 1024) {
    if (!this.modelBounds) throw new Error('人物模型尚未加载')
    const rendererSize = this.renderer.getSize(new THREE.Vector2())
    const pixelRatio = this.renderer.getPixelRatio()
    const previousView = this.view
    const previousCameraPosition = this.camera.position.clone()
    const previousTarget = this.controls.target.clone()
    const previousControlsEnabled = this.controls.enabled
    const height = this.modelBounds.max.y - this.modelBounds.min.y
    const target = new THREE.Vector3(0, this.modelBounds.min.y + height * 0.5, 0)
    const halfHeight = height * 0.58
    const camera = new THREE.OrthographicCamera(-halfHeight, halfHeight, halfHeight, -halfHeight, 0.01, 100)

    this.renderer.setPixelRatio(1)
    this.renderer.setSize(viewSize * 3, viewSize, false)
    this.renderer.setScissorTest(true)
    const directions = [VIEW_DIRECTIONS.front, VIEW_DIRECTIONS.left, VIEW_DIRECTIONS.back]
    for (let index = 0; index < directions.length; index += 1) {
      this.renderer.setViewport(index * viewSize, 0, viewSize, viewSize)
      this.renderer.setScissor(index * viewSize, 0, viewSize, viewSize)
      camera.position.copy(directions[index]).multiplyScalar(5).add(target)
      camera.lookAt(target)
      camera.updateMatrixWorld(true)
      this.renderer.render(this.scene, camera)
    }
    const dataUrl = this.canvas.toDataURL('image/png')

    this.renderer.setScissorTest(false)
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(rendererSize.x, rendererSize.y, false)
    this.camera.position.copy(previousCameraPosition)
    this.controls.target.copy(previousTarget)
    this.controls.enabled = previousControlsEnabled
    this.view = previousView
    this.camera.lookAt(previousTarget)
    this.camera.updateMatrixWorld(true)
    this.renderer.render(this.scene, this.camera)
    return (await fetch(dataUrl)).blob()
  }

  getState() {
    return {
      ready: Boolean(this.model),
      view: this.view,
      metrics: this.modelMetrics,
      canvas: { width: this.canvas.width, height: this.canvas.height }
    }
  }
}
