import * as THREE from 'three'

const inkMesh = (geometry, color, lineMaterial, ghostLineMaterial) => {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const edges = new THREE.EdgesGeometry(geometry, 20)
  const outline = new THREE.LineSegments(edges, lineMaterial)
  const echo = new THREE.LineSegments(edges, ghostLineMaterial)
  echo.scale.setScalar(1.012)
  mesh.add(outline, echo)
  return mesh
}

const limb = (radius, length, color, lineMaterial, ghostLineMaterial) => {
  const geometry = new THREE.CylinderGeometry(radius * 0.82, radius, length, 7)
  const mesh = inkMesh(geometry, color, lineMaterial, ghostLineMaterial)
  mesh.position.y = -length / 2
  return mesh
}

const makeArm = (side, color, lineMaterial, ghostLineMaterial) => {
  const shoulder = new THREE.Group()
  shoulder.position.set(side * 0.33, 1.36, 0)
  const upper = limb(0.085, 0.38, color, lineMaterial, ghostLineMaterial)
  const elbow = new THREE.Group()
  elbow.position.y = -0.38
  elbow.add(limb(0.07, 0.34, color, lineMaterial, ghostLineMaterial))
  const hand = inkMesh(new THREE.SphereGeometry(0.085, 8, 6), color, lineMaterial, ghostLineMaterial)
  hand.position.y = -0.35
  elbow.add(hand)
  shoulder.add(upper, elbow)
  return { shoulder, elbow }
}

const makeLeg = (side, color, lineMaterial, ghostLineMaterial) => {
  const hip = new THREE.Group()
  hip.position.set(side * 0.14, 0.78, 0)
  hip.add(limb(0.105, 0.43, color, lineMaterial, ghostLineMaterial))
  const knee = new THREE.Group()
  knee.position.y = -0.43
  knee.add(limb(0.085, 0.43, color, lineMaterial, ghostLineMaterial))
  const foot = inkMesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), color, lineMaterial, ghostLineMaterial)
  foot.position.set(0, -0.46, 0.07)
  knee.add(foot)
  hip.add(knee)
  return { hip, knee }
}

export const createHumanoid = (color, lineMaterial, ghostLineMaterial) => {
  const root = new THREE.Group()
  const bodyRoot = new THREE.Group()
  root.add(bodyRoot)

  const pelvis = inkMesh(new THREE.BoxGeometry(0.35, 0.22, 0.24), color, lineMaterial, ghostLineMaterial)
  pelvis.position.y = 0.82
  const torso = inkMesh(new THREE.BoxGeometry(0.52, 0.64, 0.28), color, lineMaterial, ghostLineMaterial)
  torso.position.y = 1.17
  const neck = inkMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.13, 7), color, lineMaterial, ghostLineMaterial)
  neck.position.y = 1.56
  const headPivot = new THREE.Group()
  headPivot.position.y = 1.72
  const head = inkMesh(new THREE.SphereGeometry(0.2, 9, 7), color, lineMaterial, ghostLineMaterial)
  head.scale.set(0.86, 1.08, 0.9)
  headPivot.add(head)

  const leftArm = makeArm(-1, color, lineMaterial, ghostLineMaterial)
  const rightArm = makeArm(1, color, lineMaterial, ghostLineMaterial)
  const leftLeg = makeLeg(-1, color, lineMaterial, ghostLineMaterial)
  const rightLeg = makeLeg(1, color, lineMaterial, ghostLineMaterial)
  bodyRoot.add(pelvis, torso, neck, headPivot, leftArm.shoulder, rightArm.shoulder, leftLeg.hip, rightLeg.hip)

  const rig = { root, bodyRoot, headPivot, leftArm, rightArm, leftLeg, rightLeg }
  resetPose(rig)
  return rig
}

export const resetPose = rig => {
  rig.bodyRoot.position.set(0, 0, 0)
  rig.bodyRoot.rotation.set(0, 0, 0)
  rig.headPivot.rotation.set(0, 0, 0)
  rig.leftArm.shoulder.rotation.set(0, 0, -0.1)
  rig.rightArm.shoulder.rotation.set(0, 0, 0.1)
  rig.leftArm.elbow.rotation.set(0, 0, 0)
  rig.rightArm.elbow.rotation.set(0, 0, 0)
  rig.leftLeg.hip.rotation.set(0, 0, 0)
  rig.rightLeg.hip.rotation.set(0, 0, 0)
  rig.leftLeg.knee.rotation.set(0, 0, 0)
  rig.rightLeg.knee.rotation.set(0, 0, 0)
}

const clipDuration = {
  idle: 1600,
  guard: 1200,
  walk: 900,
  run: 620,
  punch: 720,
  kick: 900,
  'hit-face': 780,
  fall: 1100,
  talk: 1200,
  reach: 900,
  'look-around': 1800
}

const normalizedTime = clipState => {
  const duration = clipDuration[clipState.clip] ?? 1000
  if (clipState.loop) return (clipState.elapsedMs % duration) / duration
  return Math.max(0, Math.min(1, clipState.elapsedMs / duration))
}

export const applyProceduralClip = (rig, clipState) => {
  resetPose(rig)
  if (!clipState) return
  const phase = normalizedTime(clipState)
  const wave = Math.sin(phase * Math.PI * 2)

  if (clipState.clip === 'idle') {
    rig.bodyRoot.position.y = Math.sin(phase * Math.PI * 2) * 0.012
  } else if (clipState.clip === 'guard') {
    rig.leftArm.shoulder.rotation.set(-0.8, 0, -0.35)
    rig.rightArm.shoulder.rotation.set(-0.95, 0, 0.35)
    rig.leftArm.elbow.rotation.x = -1.45
    rig.rightArm.elbow.rotation.x = -1.45
    rig.bodyRoot.position.y = Math.abs(wave) * 0.018
  } else if (clipState.clip === 'walk' || clipState.clip === 'run') {
    const strength = clipState.clip === 'run' ? 0.9 : 0.55
    rig.leftLeg.hip.rotation.x = wave * strength
    rig.rightLeg.hip.rotation.x = -wave * strength
    rig.leftLeg.knee.rotation.x = Math.max(0, -wave) * strength
    rig.rightLeg.knee.rotation.x = Math.max(0, wave) * strength
    rig.leftArm.shoulder.rotation.x = -wave * strength * 0.8
    rig.rightArm.shoulder.rotation.x = wave * strength * 0.8
    rig.bodyRoot.position.y = Math.abs(wave) * (clipState.clip === 'run' ? 0.055 : 0.025)
  } else if (clipState.clip === 'punch') {
    const strike = Math.sin(Math.min(1, phase) * Math.PI)
    rig.rightArm.shoulder.rotation.set(-1.55 * strike, 0.15, 0.18)
    rig.rightArm.elbow.rotation.x = -1.15 * (1 - strike)
    rig.leftArm.shoulder.rotation.x = -0.65
    rig.leftArm.elbow.rotation.x = -1.25
    rig.bodyRoot.rotation.y = -0.28 * strike
  } else if (clipState.clip === 'kick') {
    const strike = Math.sin(Math.min(1, phase) * Math.PI)
    rig.rightLeg.hip.rotation.x = -1.65 * strike
    rig.rightLeg.knee.rotation.x = 0.75 * Math.sin(Math.min(1, phase * 1.5) * Math.PI)
    rig.leftArm.shoulder.rotation.x = -0.6 * strike
    rig.rightArm.shoulder.rotation.x = 0.5 * strike
    rig.bodyRoot.rotation.z = -0.12 * strike
  } else if (clipState.clip === 'hit-face') {
    const hit = Math.sin(Math.min(1, phase) * Math.PI)
    rig.bodyRoot.rotation.z = -0.2 * hit
    rig.bodyRoot.rotation.y = 0.28 * hit
    rig.headPivot.rotation.z = -0.48 * hit
    rig.rightArm.shoulder.rotation.x = 0.5 * hit
  } else if (clipState.clip === 'fall') {
    const fall = phase * phase
    rig.bodyRoot.rotation.z = -Math.PI * 0.48 * fall
    rig.bodyRoot.position.set(0.42 * fall, -0.55 * fall, 0)
    rig.leftArm.shoulder.rotation.x = -0.8 * fall
    rig.rightArm.shoulder.rotation.x = 0.7 * fall
  } else if (clipState.clip === 'talk') {
    rig.headPivot.rotation.y = Math.sin(phase * Math.PI * 1.4) * 0.08
    rig.headPivot.rotation.x = Math.sin(phase * Math.PI * 2.2) * 0.035
    rig.leftArm.shoulder.rotation.z = -0.2 - wave * 0.08
    rig.rightArm.shoulder.rotation.z = 0.2 + Math.sin(phase * Math.PI * 1.7) * 0.08
  } else if (clipState.clip === 'reach') {
    const reach = Math.sin(Math.min(1, phase) * Math.PI / 2)
    rig.rightArm.shoulder.rotation.set(-1.25 * reach, 0, 0.18)
    rig.rightArm.elbow.rotation.x = -0.25 * reach
  } else if (clipState.clip === 'look-around') {
    rig.headPivot.rotation.y = Math.sin(phase * Math.PI * 2) * 0.5
    rig.headPivot.rotation.x = Math.sin(phase * Math.PI) * 0.08
  }
}
