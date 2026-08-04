export const EXAMPLES = [
  {
    id: 'duel',
    label: '双人巷战',
    source: `shotdsl 0.1

scene alley_duel {
  duration 6s
  fps 24
  seed 2048
  style rough-ink
}

actor hero {
  model "human-mannequin"
  color ivory
  position [-1.7m, 0m, 0m]
  rotation [0deg, 90deg, 0deg]
}

actor thug {
  model "human-mannequin"
  color tan
  position [1.3m, 0m, 0m]
  rotation [0deg, -90deg, 0deg]
}

object crate {
  primitive box
  size [0.8m, 0.8m, 0.8m]
  position [0.2m, 0.4m, -2m]
}

camera wide {
  mode lookAt
  fov 38deg
  position [0m, 2.1m, 7.2m]
  target point [0m, 1m, 0m]
}

camera impact {
  mode follow
  fov 44deg
  target actor hero bone "head"
  offset [2.1m, 0.4m, 3.8m]
}

timeline {
  cut 0s camera wide
  play 0s actor hero clip "run" loop true speed 1
  play 0s actor thug clip "guard" loop true speed 1
  key 0s hero.position [-1.7m, 0m, 0m]
  key 1.2s hero.position [-0.4m, 0m, 0m] ease smoothstep
  key 0s thug.position [1.3m, 0m, 0m]
  key 1.2s thug.position [0.35m, 0m, 0m] ease hold
  cut 1.15s camera impact
  play 1.2s actor hero clip "punch" loop false blend 0.12s
  play 1.28s actor thug clip "hit-face" loop false blend 0.08s
  key 1.15s impact.offset [2.1m, 0.4m, 3.8m]
  key 1.8s impact.offset [1.8m, 0.25m, 3.3m] ease smoothstep
  cut 2.05s camera wide
  play 2.1s actor thug clip "guard" loop true blend 0.15s
  play 3.15s actor thug clip "hook" loop false blend 0.12s
  play 3.3s actor hero clip "hit-face" loop false blend 0.08s
  play 4.25s actor hero clip "punch" loop false blend 0.12s
  play 4.38s actor thug clip "fall" loop false blend 0.1s
  key 4.3s wide.position [0m, 2.1m, 7.2m]
  key 6s wide.position [0m, 2.8m, 8.4m] ease smoothstep
}`
  },
  {
    id: 'face-impact',
    label: '拳击脸部特写',
    source: `shotdsl 0.1

scene face_punch_closeup {
  duration 3s
  fps 24
  seed 3108
  style rough-ink
}

actor boxer {
  model "human-mannequin"
  color ivory
  position [-0.4m, 0m, 0m]
  rotation [0deg, 90deg, 0deg]
}

actor opponent {
  model "human-mannequin"
  color tan
  position [0.35m, 0m, 0m]
  rotation [0deg, -90deg, 0deg]
}

camera two_shot {
  mode lookAt
  fov 40deg
  position [0m, 2m, 5.8m]
  target point [0m, 1.1m, 0m]
}

camera face_impact {
  mode impact
  fov 32deg
  attacker actor boxer bone "hand_l"
  victim actor opponent bone "head"
  distance 1.45m
  side right
  focus 0.72
}

timeline {
  cut 0s camera two_shot
  play 0s actor boxer clip "guard" loop true
  play 0s actor opponent clip "guard" loop true
  play 0.8s actor boxer clip "punch" loop false blend 0.12s
  key 0.95s boxer.position [-0.4m, 0m, 0m]
  key 0.96s boxer.position [-0.4m, 0.14m, 0m] ease hold
  cut 0.96s camera face_impact
  play 1.05s actor opponent clip "hit-face" loop false blend 0.05s
  key 1.41s boxer.position [-0.4m, 0.14m, 0m] ease hold
  key 1.42s boxer.position [-0.4m, 0m, 0m] ease hold
  cut 1.42s camera two_shot
  play 1.48s actor boxer clip "guard" loop true blend 0.15s
  play 1.58s actor opponent clip "fall" loop false blend 0.1s
}`
  },
  {
    id: 'brawl',
    label: '三人混战',
    source: `shotdsl 0.1

scene warehouse_brawl {
  duration 8s
  fps 24
  seed 9017
  style rough-ink
}

actor lead {
  model "human-mannequin"
  color ivory
  position [0m, 0m, 0.3m]
  rotation [0deg, 0deg, 0deg]
}

actor left_thug {
  model "human-mannequin"
  color tan
  position [-2.3m, 0m, -0.5m]
  rotation [0deg, 90deg, 0deg]
}

actor right_thug {
  model "human-mannequin"
  color lightgray
  position [2.4m, 0m, -0.7m]
  rotation [0deg, -90deg, 0deg]
}

object barrel_left {
  primitive cylinder
  radius 0.42m
  height 1m
  position [-3.1m, 0.5m, -2m]
}

object barrel_right {
  primitive cylinder
  radius 0.42m
  height 1m
  position [3.1m, 0.5m, -2m]
}

camera master {
  mode lookAt
  fov 43deg
  position [0m, 3.4m, 8.8m]
  target point [0m, 1m, -0.2m]
}

camera lead_close {
  mode follow
  fov 44deg
  target actor lead bone "head"
  offset [-2m, 0.3m, 3.8m]
}

camera orbit_cam {
  mode orbit
  fov 46deg
  target actor lead
  radius 5.3m
  azimuth -32deg
  elevation 17deg
}

timeline {
  cut 0s camera master
  play 0s actor lead clip "guard" loop true
  play 0s actor left_thug clip "run" loop true
  play 0s actor right_thug clip "run" loop true
  key 0s left_thug.position [-2.3m, 0m, -0.5m]
  key 1.3s left_thug.position [-0.75m, 0m, 0m] ease smoothstep
  key 0s right_thug.position [2.4m, 0m, -0.7m]
  key 2.9s right_thug.position [0.9m, 0m, -0.2m] ease smoothstep
  cut 1.25s camera lead_close
  play 1.35s actor lead clip "punch" loop false blend 0.12s
  play 1.43s actor left_thug clip "hit-face" loop false blend 0.08s
  cut 2.15s camera master
  play 2.3s actor left_thug clip "fall" loop false blend 0.1s
  play 2.85s actor lead clip "guard" loop true blend 0.15s
  play 3.15s actor right_thug clip "hook" loop false blend 0.12s
  play 3.32s actor lead clip "hit-face" loop false blend 0.08s
  cut 4s camera orbit_cam
  key 4s orbit_cam.azimuth -32deg
  play 4.2s actor lead clip "cross" loop false blend 0.12s
  play 4.35s actor right_thug clip "hit-face" loop false blend 0.08s
  cut 5.2s camera master
  play 5.35s actor lead clip "punch" loop false blend 0.12s
  play 5.48s actor right_thug clip "fall" loop false blend 0.1s
  key 5.2s master.position [0m, 3.4m, 8.8m]
  key 8s master.position [0m, 4.2m, 10.5m] ease smoothstep
}`
  },
  {
    id: 'chase',
    label: '跟拍追逐',
    source: `shotdsl 0.1

scene corridor_chase {
  duration 5s
  fps 30
  seed 77
  style rough-ink
}

actor runner {
  model "human-mannequin"
  color ivory
  position [-3m, 0m, 0m]
  rotation [0deg, 90deg, 0deg]
}

object marker_a {
  primitive box
  size [0.3m, 2.5m, 0.3m]
  position [-1m, 1.25m, -1.8m]
}

object marker_b {
  primitive box
  size [0.3m, 2.5m, 0.3m]
  position [2m, 1.25m, -1.8m]
}

camera chase {
  mode follow
  fov 52deg
  target actor runner bone "head"
  offset [-2.8m, 0.65m, 3.8m]
}

camera finish {
  mode lookAt
  fov 34deg
  position [6.5m, 1.5m, 1.8m]
  target point [3m, 1.1m, 0m]
}

timeline {
  cut 0s camera chase
  play 0s actor runner clip "run" loop true speed 1.25
  key 0s runner.position [-3m, 0m, 0m]
  key 4.2s runner.position [3.8m, 0m, 0m] ease smoothstep
  key 0s chase.offset [-2.8m, 0.65m, 3.8m]
  key 3.8s chase.offset [-1.7m, 0.4m, 2.9m] ease smoothstep
  cut 4.25s camera finish
  play 4.3s actor runner clip "idle" loop true blend 0.18s
}`
  },
  {
    id: 'orbit',
    label: '环绕建立镜头',
    source: `shotdsl 0.1

scene reveal {
  duration 5s
  fps 24
  seed 42
  style rough-ink
}

actor subject {
  model "human-mannequin"
  color ivory
  position [0m, 0m, 0m]
  rotation [0deg, -25deg, 0deg]
}

object block_a {
  primitive box
  size [1.2m, 1m, 1.2m]
  position [-2m, 0.5m, -1.5m]
}

object block_b {
  primitive sphere
  radius 0.65m
  position [2m, 0.65m, -1.2m]
}

camera orbit_cam {
  mode orbit
  fov 40deg
  target actor subject bone "head"
  radius 5m
  azimuth -55deg
  elevation 12deg
}

timeline {
  cut 0s camera orbit_cam
  play 0s actor subject clip "idle" loop true
  key 0s orbit_cam.azimuth -55deg
  key 5s orbit_cam.azimuth 55deg ease smoothstep
  key 0s orbit_cam.radius 5m
  key 5s orbit_cam.radius 3.8m ease smoothstep
}`
  }
]
