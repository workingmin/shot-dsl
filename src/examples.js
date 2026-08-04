const EXERCISE_ACTORS = ['instructor', 'left_front', 'right_front', 'left_back', 'right_back']

const playExerciseGroup = (time, clip, speed = 1) => EXERCISE_ACTORS
  .map(actorId => `  play ${time} actor ${actorId} clip "${clip}" loop true speed ${speed} blend 0.25s`)
  .join('\n')

const CINEMATIC_PURSUIT = `shotdsl 0.1

scene night_extraction {
  duration 8.5s
  fps 30
  seed 7331
  style cinematic
}

actor scout {
  model "game-ready-soldier"
  color white
  position [-3.8m, 0m, 0.25m]
  rotation [0deg, 90deg, 0deg]
}

actor partner {
  model "game-ready-soldier"
  color lightgray
  position [-4.8m, 0m, -0.8m]
  rotation [0deg, 90deg, 0deg]
}

object loading_bay {
  primitive box
  size [9m, 0.12m, 5m]
  color darkslategray
  position [0m, 0.06m, -0.5m]
}

object container_left {
  primitive box
  size [2.5m, 2.6m, 1.6m]
  color #38444d
  position [-1.7m, 1.3m, -2.4m]
}

object container_right {
  primitive box
  size [2.2m, 2.2m, 1.5m]
  color #473f3a
  position [3.2m, 1.1m, -2.2m]
}

camera establish {
  mode lookAt
  fov 37deg
  position [0m, 3.1m, 10.5m]
  target point [0m, 1m, -0.4m]
  roll -0.8deg
}

camera shoulder_track {
  mode follow
  fov 43deg
  target actor scout bone "head"
  offset [-2.7m, 0.4m, 3.1m]
  shake 0.015m
}

camera long_lens {
  mode lookAt
  fov 27deg
  position [7.6m, 1.55m, 4.2m]
  target point [3.4m, 1.1m, 0m]
}

timeline {
  cut 0s camera establish
  play 0s actor scout clip "idle" loop true
  play 0s actor partner clip "idle" loop true

  play 0.7s actor scout clip "walk" loop true blend 0.22s
  play 0.9s actor partner clip "walk" loop true blend 0.22s
  key 0.7s scout.position [-3.8m, 0m, 0.25m]
  key 2.3s scout.position [-1.9m, 0m, 0.25m] ease smoothstep
  key 0.9s partner.position [-4.8m, 0m, -0.8m]
  key 2.5s partner.position [-2.9m, 0m, -0.8m] ease smoothstep

  cut 2.15s camera shoulder_track
  play 2.25s actor scout clip "run" loop true speed 1.08 blend 0.18s
  play 2.45s actor partner clip "run" loop true speed 1.05 blend 0.18s
  key 6.65s scout.position [4.1m, 0m, 0.25m] ease smoothstep
  key 6.75s partner.position [3.2m, 0m, -0.8m] ease smoothstep
  key 2.15s shoulder_track.offset [-2.7m, 0.4m, 3.1m]
  key 6.4s shoulder_track.offset [-1.85m, 0.25m, 2.5m] ease smoothstep
  key 2.15s shoulder_track.shake 0.015m
  key 5.7s shoulder_track.shake 0.035m ease smoothstep

  cut 6.55s camera long_lens
  play 7.15s actor scout clip "idle" loop true blend 0.24s
  play 7.35s actor partner clip "idle" loop true blend 0.24s
  key 6.55s long_lens.position [7.6m, 1.55m, 4.2m]
  key 8.5s long_lens.position [6.7m, 1.48m, 3.6m] ease smoothstep
}`

const FIGHT_CLOSEUP = `shotdsl 0.1

scene fight_coverage_closeup {
  duration 5.5s
  fps 24
  seed 3108
  style cinematic
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

object ring_floor {
  primitive box
  size [5m, 0.08m, 4m]
  color #4e555b
  position [0m, -0.04m, 0m]
}

camera master {
  mode lookAt
  fov 38deg
  position [0m, 2m, 5.8m]
  target point [0m, 1.08m, 0m]
}

camera shoulder {
  mode follow
  fov 34deg
  target actor boxer bone "head"
  offset [-1.65m, 0.08m, 2.65m]
  shake 0.008m
}

camera face_impact {
  mode impact
  fov 30deg
  attacker actor boxer bone "hand_l"
  victim actor opponent bone "head"
  distance 1.42m
  side right
  focus 0.72
  shake 0.018m
  roll -1.2deg
}

timeline {
  cut 0s camera master
  play 0s actor boxer clip "guard" loop true
  play 0s actor opponent clip "guard" loop true

  cut 0.52s camera shoulder
  play 0.8s actor boxer clip "punch" loop false blend 0.12s
  key 0.95s boxer.position [-0.4m, 0m, 0m]
  key 0.96s boxer.position [-0.4m, 0.14m, 0m] ease hold
  cut 0.96s camera face_impact
  play 1.05s actor opponent clip "hit-face" loop false blend 0.05s
  key 1.41s boxer.position [-0.4m, 0.14m, 0m] ease hold
  key 1.42s boxer.position [-0.4m, 0m, 0m] ease hold

  cut 1.42s camera master
  play 1.48s actor boxer clip "guard" loop true blend 0.15s
  play 1.72s actor opponent clip "guard" loop true blend 0.15s
  play 2.25s actor opponent clip "hook" loop false blend 0.12s
  play 2.4s actor boxer clip "hit-face" loop false blend 0.07s

  cut 3.05s camera shoulder
  play 3.18s actor boxer clip "cross" loop false blend 0.12s
  play 3.34s actor opponent clip "hit-face" loop false blend 0.06s
  cut 3.8s camera master
  play 3.92s actor opponent clip "fall" loop false blend 0.1s
  key 3.8s master.position [0m, 2m, 5.8m]
  key 5.5s master.position [0m, 2.55m, 7.1m] ease smoothstep
}`

const ENSEMBLE_BRAWL = `shotdsl 0.1

scene warehouse_ensemble_brawl {
  duration 8s
  fps 24
  seed 9017
  style cinematic
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
  color #495057
  position [-3.1m, 0.5m, -2m]
}

object barrel_right {
  primitive cylinder
  radius 0.42m
  height 1m
  color #60483d
  position [3.1m, 0.5m, -2m]
}

camera master {
  mode lookAt
  fov 41deg
  position [0m, 3.2m, 8.7m]
  target point [0m, 1m, -0.2m]
}

camera lead_close {
  mode follow
  fov 35deg
  target actor lead bone "head"
  offset [-1.85m, 0.18m, 3.15m]
  shake 0.012m
}

camera orbit_cam {
  mode orbit
  fov 38deg
  target actor lead
  radius 5.1m
  azimuth -30deg
  elevation 16deg
  roll 0.6deg
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

  cut 1.2s camera lead_close
  play 1.35s actor lead clip "punch" loop false blend 0.12s
  play 1.43s actor left_thug clip "hit-face" loop false blend 0.08s
  cut 2.15s camera master
  play 2.3s actor left_thug clip "fall" loop false blend 0.1s
  play 2.85s actor lead clip "guard" loop true blend 0.15s
  play 3.15s actor right_thug clip "hook" loop false blend 0.12s
  play 3.32s actor lead clip "hit-face" loop false blend 0.08s

  cut 4s camera orbit_cam
  key 4s orbit_cam.azimuth -30deg
  key 5.15s orbit_cam.azimuth 12deg ease smoothstep
  play 4.2s actor lead clip "cross" loop false blend 0.12s
  play 4.35s actor right_thug clip "hit-face" loop false blend 0.08s
  cut 5.2s camera master
  play 5.35s actor lead clip "punch" loop false blend 0.12s
  play 5.48s actor right_thug clip "fall" loop false blend 0.1s
  key 5.2s master.position [0m, 3.2m, 8.7m]
  key 8s master.position [0m, 4.1m, 10.3m] ease smoothstep
}`

const CALISTHENICS_SOURCE = `shotdsl 0.1

scene broadcast_calisthenics_390s {
  duration 390s
  fps 24
  seed 20260804
  style cinematic
}

actor instructor {
  model "human-mannequin"
  color ivory
  position [0m, 0m, 0.6m]
}
actor left_front {
  model "human-mannequin"
  color tan
  position [-1.8m, 0m, 0m]
}
actor right_front {
  model "human-mannequin"
  color lightgray
  position [1.8m, 0m, 0m]
}
actor left_back {
  model "human-mannequin"
  color wheat
  position [-0.95m, 0m, -1.7m]
}
actor right_back {
  model "human-mannequin"
  color silver
  position [0.95m, 0m, -1.7m]
}

object stage {
  primitive box
  size [8m, 0.08m, 6m]
  color #596168
  position [0m, -0.04m, -0.6m]
}

camera master {
  mode lookAt
  fov 38deg
  position [0m, 4.2m, 11.5m]
  target point [0m, 1m, -0.55m]
}
camera coach {
  mode follow
  fov 35deg
  target actor instructor bone "head"
  offset [2.7m, 0.35m, 5.3m]
}
camera orbit_group {
  mode orbit
  fov 40deg
  target actor instructor
  radius 8m
  azimuth -28deg
  elevation 18deg
}
camera side_floor {
  mode lookAt
  fov 40deg
  position [5.8m, 1.3m, 4.8m]
  target point [0m, 0.45m, -0.65m]
}

timeline {
  # 00:00–00:15 准备
  cut 0s camera master
${playExerciseGroup('0s', 'idle')}
  # 00:15–01:00 伸展
  cut 15s camera coach
${playExerciseGroup('15s', 'stretch', 0.65)}
  cut 45s camera master
  # 01:00–02:00 行进
${playExerciseGroup('60s', 'march', 0.9)}
  # 02:00–03:00 开合跳
  cut 120s camera orbit_group
${playExerciseGroup('120s', 'jumping-jacks', 0.85)}
  # 03:00–04:00 侧步
  cut 180s camera side_floor
${playExerciseGroup('180s', 'side-step', 0.8)}
  # 04:00–04:45 下蹲
  cut 240s camera master
${playExerciseGroup('240s', 'crouch', 0.7)}
  # 04:45–05:30 俯卧撑
  cut 285s camera side_floor
${playExerciseGroup('285s', 'pushup', 0.65)}
  # 05:30–06:05 节奏整理
  cut 330s camera orbit_group
${playExerciseGroup('330s', 'dance', 0.85)}
  # 06:05–06:30 放松
  cut 365s camera coach
${playExerciseGroup('365s', 'cooldown', 0.6)}
  key 0s master.position [0m, 4.2m, 11.5m]
  key 390s master.position [0m, 4.8m, 12.5m] ease smoothstep
  key 120s orbit_group.azimuth -28deg
  key 180s orbit_group.azimuth 28deg ease smoothstep
  key 330s orbit_group.azimuth -18deg
  key 365s orbit_group.azimuth 18deg ease smoothstep
}`

export const EXAMPLES = [
  {
    id: 'cinematic-pursuit',
    label: '游戏角色 · 追踪镜头',
    description: '纹理蒙皮人物、Walk/Run 动捕、手持跟拍与长焦收束',
    source: CINEMATIC_PURSUIT
  },
  {
    id: 'fight-closeup',
    label: '拳击 · 特写覆盖',
    description: '主镜头、过肩镜头、骨骼接触特写与受击反应',
    source: FIGHT_CLOSEUP
  },
  {
    id: 'ensemble-brawl',
    label: '三人 · 群体调度',
    description: '三套独立骨架、交叉动作、环绕和硬切剪辑',
    source: ENSEMBLE_BRAWL
  },
  {
    id: 'calisthenics-long',
    label: '长时间轴 · 06:30',
    description: '五人动作编排与跨五分钟确定性拖拽验证',
    source: CALISTHENICS_SOURCE
  }
]
