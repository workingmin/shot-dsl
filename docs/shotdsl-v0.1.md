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

`style` 当前支持四个规范值：

- `cinematic`：保留 glTF 贴图与 PBR 材质，启用环境反射、ACES tone mapping、电影布光和软阴影；
- `rough-ink`：使用 OutlineEffect 和几何描边的传统分镜线稿模式；
- `wireframe`：真实三角网格线框材质与深色技术预览背景；
- `cinematic-outline`：保留 PBR 表面，同时叠加人物和物体轮廓。

兼容输入 `rough_ink`、`storyboard`、`wire-frame`、`3d_cinematic`、`cinematic_wireframe`、`3d_cinematic_wireframe` 等会在编译期规范化，并产生 `W_STYLE_ALIAS`。Scene IR 只保存规范 style，同时用 `requestedStyle` 保留原始表达。

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

clip 必须存在于动作目录，并且所选人物模型必须明确声明支持。全局认识某个动作、但具体模型无法执行时返回 `E_MODEL_CLIP`；运行时不再静默回退到 `idle`。

DSL 使用语义 Clip 名称，资产目录负责把它映射到具体 glTF Animation Clip。例如 `punch` 可以映射为资产中的 `Punch_Jab`，因此更换角色资产时不需要修改时间轴。`blend` 表示新动作开始后与前一动作交叉混合的时长；任意 seek 时也必须由绝对时间重新计算相同权重。

当前内置 21 个规范语义：`idle`、`guard`、`walk`、`march`、`run`、`stretch`、`dance`、`side-step`、`jumping-jacks`、`crouch`、`pushup`、`cooldown`、`punch`、`cross`、`hook`、`kick`、`hit-face`、`fall`、`talk`、`reach`、`look-around`。

常用别名会被规范化，例如 `speak/dialogue → talk`、`grab/extend-hand → reach`、`look/glance → look-around`、`sprint/jog → run`。每个模型的动作能力分为：

- `exact`：直接使用语义匹配的资产 Clip；
- `procedural`：在基础 Clip 上确定性叠加骨骼或口型通道；
- `approximate`：使用最接近的资产 Clip，并产生 `W_APPROXIMATE_CLIP`；
- 缺失：产生 `E_MODEL_CLIP`，禁止播放。

完整矩阵见 [ShotDSL 支持能力评估](support-matrix.md)。

### 人物注视

```text
gaze <time> actor <actor-id> target <point|actor|object>
  [duration <time>]
  [strength <0..1>]
```

例如：

```shotdsl
gaze 3s actor witness target object photo duration 4s strength 0.9
gaze 8s actor witness target actor detective bone "head" duration 2s
```

`gaze` 是有持续时间的离散约束事件。时间轴按绝对时间决定是否激活，播放器在动作采样后叠加头部朝向；重复 seek 到相同时间得到相同结果。

scene duration 使用绝对时间，时间轴和播放器均采用毫秒直接求值。当前产品示例聚焦 5～10 秒的短场景和镜头覆盖，不把长节目编排作为现阶段展示目标。

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

### impact

`impact` 用于双人物击打特写。相机逐帧读取出拳骨骼和受击骨骼的世界坐标，以二者的加权点为焦点，并根据攻击方向建立稳定的侧面机位：

```text
mode impact
attacker actor boxer bone "hand_l"
victim actor opponent bone "head"
fov 32deg
distance 1.45m
side right
focus 0.72
```

- `attacker`、`victim` 必须引用 actor 的实际骨骼；
- `distance` 是相机到接触焦点的构图距离；
- `side` 为 `left` 或 `right`，决定攻击轴的观察侧；
- `focus` 取 0～1，0 完全偏向拳头，1 完全偏向受击骨骼；
- 动作目录可声明 `impactTimeMs`、`effectorBone`、`targetBone` 和 `responseClip`，示例按命中峰值安排 `cut` 与受击动作；
- 在尚未接入手臂 IK 时，可以只在特写切入区间用 actor position 的 `hold` 关键帧做小幅接触校准，切回全景时恢复地面位置。

所有 camera mode 还可声明电影化机位属性：

```text
shake 0.015m
roll -1.2deg
```

`shake` 使用 scene seed 和绝对时间求值，同一时间点重复 seek 会得到完全相同的相机偏移；`roll` 表示镜头绕视轴的倾斜。二者都支持 `key` 动画。

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
      "model": "human-mannequin",
      "requestedModel": "humanoid-male",
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

当前另有以下能力诊断：

- `E_UNKNOWN_MODEL`：模型或 preset 不在目录中；
- `E_MODEL_CLIP`：模型不支持规范动作；
- `W_STYLE_ALIAS`、`W_ACTION_ALIAS`、`W_MODEL_ALIAS`：输入已规范化；
- `W_APPROXIMATE_CLIP`：使用近似动作资产；
- `E_GAZE_*`：注视语法、持续时间或强度非法。

## 待验证问题

1. `key 36f` 是否值得保留，还是 DSL 只允许绝对时间；
2. 动作 clip 的结束、抢占和 crossfade 是否用更多 event 表达；
3. camera mode 是否允许在同一 camera 上动态切换；
4. 统一骨骼语义如何扩展到手指、眼球、下颌和脊柱分段；
5. 多 shot 是否放在单一文档，还是一个文档只描述一个连续 scene；
6. 物体 parent/constraint、路径运动和 IK 应在哪个版本加入。
