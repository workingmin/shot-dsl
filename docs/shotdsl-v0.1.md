# ShotDSL v0.1

ShotDSL 记录分镜设计，而不是逐帧数据。编译器把声明转换为 Scene IR 的实体、关键帧轨道和离散事件，播放器在目标时间点求值。

## 最小示例

```shotdsl
shotdsl 0.1

scene handoff {
  duration 6s
  fps 24
  seed 42
  style storyboard
}

actor sender {
  model "storyboard-mannequin"
  position [-2m, 0m, 0m]
  rotation [0deg, 90deg, 0deg]
}

actor receiver {
  model "storyboard-mannequin"
  position [0m, 0m, 0m]
  rotation [0deg, -90deg, 0deg]
}

object envelope {
  primitive box
  size [0.28m, 0.04m, 0.18m]
  position [-1.5m, 1m, 0m]
}

camera master {
  mode lookAt
  fov 42deg
  position [0m, 2.5m, 6m]
  target point [0m, 1m, 0m]
}

camera insert {
  mode lookAt
  fov 26deg
  position [-0.7m, 1.5m, 2m]
  target object envelope
}

beat exchange {
  from 0s
  to 6s
  intent "从全景进入道具交接特写"
  focus object envelope
  continuity preserve
  notes "保持传递方向从左向右"
}

timeline {
  cut 0s camera master
  note 0s "全景建立两人站位" duration 1.5s
  play 0s actor sender clip "idle" loop true
  play 0s actor receiver clip "idle" loop true
  cut 2s camera insert
  note 2s "切手部特写，道具从左向右移动" duration 2s
  play 2s actor sender clip "reach" loop false blend 0.12s
  key 2s envelope.position [-1.5m, 1m, 0m]
  key 4s envelope.position [-0.2m, 1m, 0m] ease smoothstep
}
```

## 文档结构

```text
shotdsl 0.1
scene <id> { ... }
actor <id> { ... }
object <id> { ... }
light <id> { ... }
camera <id> { ... }
beat <id> { ... }
timeline { ... }
```

标识符使用 `[A-Za-z_][A-Za-z0-9_-]*`。字符串使用双引号。行尾 `#` 可写注释，但十六进制颜色值不视为注释。

## Scene

```shotdsl
scene scene_id {
  duration 10s
  fps 24
  seed 1
  style storyboard
}
```

- `duration` 必须大于 0；
- `fps` 为 1～120 的整数；
- `seed` 用于确定性效果；
- 唯一规范 style 为 `storyboard`；
- `rough-ink`、`rough_ink` 是迁移别名。

## Actor

```shotdsl
actor hero {
  model "storyboard-mannequin"
  position [0m, 0m, 0m]
  rotation [0deg, 90deg, 0deg]
  scale [1, 1, 1]
  visibility true
}
```

当前只提供统一中性代理人。旧名称 `human-mannequin` 和 `humanoid` 会解析为 `storyboard-mannequin`。

## Object

```shotdsl
object table {
  primitive box
  size [2m, 0.75m, 1m]
  position [0m, 0.75m, 0m]
}
```

支持 `box`、`sphere`、`cylinder` 和 `cone`。box 使用 `size`；其他几何使用 `radius` 和可选 `height`。对象是空间代理，不包含材质、物理和资产生成语义。

## Beat

```shotdsl
beat arrival {
  from 0s
  to 4s
  intent "人物从入口走到柜台"
  focus actor customer
  continuity preserve
  notes "运动方向保持从右向左"
}
```

beat 描述某个时间范围的分镜意图，不直接驱动渲染。字段：

- `from`、`to`：时间范围；
- `intent`：必填的设计意图；
- `focus`：point、actor、object，可选 bone；
- `continuity preserve|reset`：是否保持前一段空间连续性；
- `emotion`、`notes`：可选创作备注，不映射为面部表情。

## Camera

### fixed

完全由 position/rotation 关键帧控制。

```shotdsl
camera locked {
  mode fixed
  fov 45deg
  position [0m, 2m, 6m]
  rotation [-10deg, 0deg, 0deg]
}
```

### lookAt

相机位置可动画，始终朝向 target。

```shotdsl
camera master {
  mode lookAt
  fov 42deg
  position [0m, 2.5m, 6m]
  target actor hero bone "head"
}
```

### follow

跟随 target 并应用世界空间 offset。

```shotdsl
camera follow {
  mode follow
  fov 38deg
  target actor hero bone "head"
  offset [-2m, 0.3m, 3m]
}
```

### orbit

使用 radius、azimuth、elevation 围绕 target 运动。

```shotdsl
camera orbit {
  mode orbit
  target actor hero
  radius 5m
  azimuth -30deg
  elevation 15deg
}
```

相机还支持 `shake` 和 `roll`，两者按 seed 和绝对时间确定性求值。

## Timeline

### Key

```text
key <time> <entity>.<property> <value> [ease linear|smoothstep|hold]
```

actor/object 支持 position、rotation、scale、visibility。camera 支持 position、rotation、visibility、fov、offset、radius、azimuth、elevation、shake、roll。

position/scale 使用线性插值，rotation 在编译阶段转换为 quaternion 并使用 slerp；hold 保持前一个值。

### Cut

```shotdsl
cut 0s camera master
cut 2.5s camera insert
```

cut 是离散事件，不通过短时插值模拟。

### Play

```shotdsl
play 0s actor hero clip "walk" loop true speed 1 blend 0.15s
```

支持动作：idle、walk、run、crouch、talk、reach、look-around、fall。未知动作或模型缺少动作会报错，近似动作会产生 warning。

### Gaze

```shotdsl
gaze 2s actor hero target object clue duration 2s strength 0.8
```

目标支持 point、actor、object 和 actor bone。strength 范围为 0～1。

### Attach

```shotdsl
attach 2s object envelope to actor hero bone "hand_r" offset [0m, 0m, 0.08m] release 1.5s
```

`release` 表示从 attach 开始计算的持续时间。释放后对象恢复其时间轴轨道状态。

### IK

```shotdsl
ik 2s actor hero effector "hand_r" target object envelope weight 0.7 duration 0.8s
```

IK 在动作采样后执行，用于分镜级接触校正，不保证物理准确。

### Note

```shotdsl
note 2s "镜头缓慢推近，人物在此停顿" duration 2s
```

note 是分镜文字标注。它进入 Scene IR、时间轴标记和预览画面，适合记录镜头运动、走位方向、动作停顿和节奏要求。

## 时间单位

- `250ms`
- `1.5s`
- `12f`，按 scene fps 转换

长度使用 `m`、`cm`、`mm`，角度使用 `deg` 或 `rad`。

## Scene IR

```js
{
  version: '0.1',
  scene: { id, durationMs, fps, seed, style },
  entities: { ... },
  beats: { ... },
  tracks: [
    { target, entityId, property, valueType, keys: [...] }
  ],
  events: [
    { type: 'cameraCut' | 'playClip' | 'gaze' | 'attach' | 'ik' | 'note', ... }
  ]
}
```

Scene IR 是内部契约。外部输入无需使用 JSON，也无需生成逐帧姿态。
