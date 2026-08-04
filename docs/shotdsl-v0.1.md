# ShotDSL v0.1 草案

本草案用于验证语言边界，不代表最终语法。目标是让人、LLM 和格式化工具都能稳定读写，并能无歧义地编译成 Scene IR。

## 设计目标

- 行式、显式、容易生成和 diff；
- 实体 ID、单位和时间不可省略到产生歧义；
- 关键帧与离散事件分开；
- 能表达相机硬切、运动插值和人物动作 clip；
- Parser 可以给出准确的行列诊断；
- 同一 DSL、资产目录和 seed 必须得到同一画面。

## 动态打斗示例

```shotdsl
shotdsl 0.1

scene alley_fight {
  duration 6s
  fps 24
  seed 2048
  style rough-ink
}

actor hero {
  model "humanoid-male"
  position [-1.5m, 0m, 0m]
  rotation [0deg, 90deg, 0deg]
}

actor thug {
  model "humanoid-male"
  position [1.0m, 0m, 0m]
  rotation [0deg, -90deg, 0deg]
}

object crate {
  primitive box
  size [0.8m, 0.8m, 0.8m]
  position [0m, 0.4m, -2m]
}

camera wide {
  mode lookAt
  fov 35deg
  position [0m, 1.7m, 7m]
  target point [0m, 1.1m, 0m]
}

camera impact {
  mode follow
  fov 55deg
  target actor hero bone "head"
  offset [1.2m, 0.3m, 2.2m]
}

timeline {
  cut 0s camera wide

  key 0s hero.position [-1.5m, 0m, 0m]
  key 1.2s hero.position [-0.4m, 0m, 0m] ease linear
  play 0s actor hero clip "run" loop true speed 1.0
  play 1.2s actor hero clip "punch" loop false blend 0.10s

  key 0s thug.position [1.0m, 0m, 0m]
  key 1.2s thug.position [0.5m, 0m, 0m] ease hold
  play 0s actor thug clip "guard" loop true speed 1.0
  play 1.28s actor thug clip "hit-face" loop false blend 0.06s

  cut 1.15s camera impact
  key 1.15s impact.offset [1.2m, 0.3m, 2.2m]
  key 1.55s impact.offset [1.0m, 0.2m, 1.8m] ease smoothstep

  cut 2.0s camera wide
  key 2.0s crate.rotation [0deg, 0deg, 0deg]
  key 3.0s crate.rotation [0deg, 120deg, 20deg] ease linear
}
```

## 核心语句

### 文档头

```text
shotdsl <major.minor>
```

版本必填。Parser 不应猜测不兼容版本。

### Scene

```text
scene <id> {
  duration <time>
  fps <number>
  seed <integer>
  style <style-id>
}
```

### 实体

```text
actor <id>  { ... }
object <id> { ... }
light <id>  { ... }
camera <id> { ... }
```

v0.1 的 object 支持 glTF `model` 或内置 `primitive`，二者只能选一个。

### 连续关键帧

```text
key <time> <entity>.<property> <value> [ease linear|smoothstep|hold]
```

同一 track 的 key 在编译阶段按时间排序；同一时间出现两个 key 是语义错误，不采用“后者覆盖前者”。首个 key 之前使用实体初始值，最后一个 key 之后保持末值。

`ease` 写在后一个 key 上，描述“从前一个 key 到达当前 key”的插值方式。例如后一个 key 使用 `hold` 时，属性保持前值直到当前时间点再跳变。

### 相机切换

```text
cut <time> camera <camera-id>
```

`cut` 是离散事件。相机之间的连续运动通过同一 camera 的 key 表达。

### 人物动作

```text
play <time> actor <actor-id> clip <clip-name>
  [loop true|false]
  [speed <number>]
  [blend <time>]
```

clip 必须存在于资产目录。缺失 clip 是编译错误或显式 warning，不能静默回退到 `idle`。

## 类型与单位

| 类型 | 示例 | 内部表示 |
|---|---|---|
| 时间 | `120ms`、`1.5s`、`36f` | 毫秒；frame 根据 scene fps 换算 |
| 长度 | `1.7m`、`25cm` | 米 |
| 角度 | `90deg`、`1.57rad` | 弧度 |
| Vector3 | `[1m, 0m, -2m]` | 三个 number |
| Euler | `[0deg, 90deg, 0deg]` | 编译为 quaternion |
| 布尔 | `true`、`false` | boolean |
| ID | `hero`、`camera_1` | ASCII identifier |
| 字符串 | `"hit-face"` | UTF-8 string |

禁止没有单位的时间、长度和角度。速度倍率、颜色分量等无量纲值例外。

## 相机模式

### fixed

```text
mode fixed
position [0m, 2m, 6m]
rotation [-10deg, 0deg, 0deg]
```

### lookAt

```text
mode lookAt
position [0m, 2m, 6m]
target point [0m, 1m, 0m]
```

target 也可引用实体或骨骼：

```text
target actor hero bone "head"
```

### follow

```text
mode follow
target actor hero
offset [0m, 1.2m, 4m]
```

### orbit

```text
mode orbit
target actor hero
radius 5m
azimuth 30deg
elevation 15deg
```

## Scene IR 示例

Parser 和 Semantic Compiler 输出规范化 JSON，不保留语言层简写：

```json
{
  "version": "0.1",
  "scene": {
    "id": "alley_fight",
    "durationMs": 6000,
    "fps": 24,
    "seed": 2048
  },
  "entities": {
    "hero": {
      "kind": "actor",
      "model": "humanoid-male",
      "transform": {
        "position": [-1.5, 0, 0],
        "rotationQuaternion": [0, 0.7071068, 0, 0.7071068],
        "scale": [1, 1, 1]
      }
    }
  },
  "tracks": [
    {
      "target": "hero.position",
      "valueType": "vector3",
      "keys": [
        { "timeMs": 0, "value": [-1.5, 0, 0], "interpolation": "linear" },
        { "timeMs": 1200, "value": [-0.4, 0, 0], "interpolation": "linear" }
      ]
    }
  ],
  "events": [
    { "timeMs": 0, "type": "cameraCut", "cameraId": "wide" },
    {
      "timeMs": 1200,
      "type": "playClip",
      "actorId": "hero",
      "clip": "punch",
      "loop": false,
      "blendMs": 100
    }
  ]
}
```

## 编译诊断

诊断必须机器可读，以便 UI 展示和 LLM 修复：

```json
{
  "code": "E_UNKNOWN_CLIP",
  "message": "Actor 'hero' model does not provide clip 'flying-kick'",
  "line": 38,
  "column": 28,
  "length": 13,
  "suggestions": ["kick-high", "jump-kick"]
}
```

v0.1 至少覆盖：

- 重复或非法 ID；
- 未知属性和单位；
- 引用不存在的实体、相机、骨骼或 clip；
- key 超出 scene duration；
- 同一 track 同一时间重复 key；
- camera mode 缺少必需参数；
- 不支持的插值类型；
- glTF 模型和 primitive 同时声明。

## 待验证问题

1. `key 36f` 是否值得保留，还是 DSL 只允许绝对时间；
2. 动作 clip 的结束、抢占和 crossfade 是否用更多 event 表达；
3. camera mode 是否允许在同一 camera 上动态切换；
4. target bone 的命名如何跨模型统一；
5. 多 shot 是否放在单一文档，还是一个文档只描述一个连续 scene；
6. 物体 parent/constraint、路径运动和 IK 应在哪个版本加入。
