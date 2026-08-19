# 技术可行性与实施路线

## 结论

“文本化 3D 动态分镜预演工具”整体技术可行，建议进入正式 MVP 设计。但原流程中的 `RoughJS-WebGL` 需要替换：Rough.js 官方实现面向 HTML Canvas 和 SVG，没有 WebGL 3D renderer；npm 也没有名为 `roughjs-webgl` 的正式包。

推荐将渲染阶段定义为 Three.js NPR（Non-Photorealistic Rendering）管线：

```text
低多边形/基础模型
  → toon 或纯色材质
  → depth + normal 边缘检测
  → Sobel / outline
  → 带 seed 的屏幕空间 jitter/noise
  → 纸张纹理与轻量明暗
```

Rough.js 可以在两个场景中继续试验：

- 截取静帧后生成二维手绘化版本；
- 在 Three.js canvas 上覆盖箭头、运动线和批注。

它不适合承担动态 3D 场景的遮挡、蒙皮人物轮廓和每帧线条渲染。

## 已验证实现

当前版本已完成真人比例多人 glTF 骨骼人物、击打特写、6 分 30 秒长节目、catalog 驱动的语义能力校验和四种渲染 preset：`GLTFLoader` 加载 Mesh2Motion/Quaternius CC0 humanoid，`SkeletonUtils.clone` 生成独立骨架，`AnimationMixer` 根据 Scene IR 的绝对时间采样 Clip，并在 `blend` 窗口混合前后动作。人物资产会执行脚底归零和 1.78 米身高归一；`impact` 相机逐帧读取拳头与头部骨骼的世界坐标并自动构图；`gaze` 在动作采样后确定性叠加头部注视；长节目可在 5 分钟后的分节直接 seek 且重复像素一致。

Style、action、model 已统一进入纯数据 catalog。编译器会规范化兼容别名、按人物模型区分 exact / procedural / approximate / unsupported，并拒绝模型无法执行的动作。运行时不再把未知动作静默降级到 Idle。能力详情见 [ShotDSL 支持能力评估](support-matrix.md)。

当前默认 `human-mannequin` 提供约 7～8 头身、统一 humanoid 骨架以及走、跑、搏击架势、拳击、受击和倒地动作；`robot-expressive` 仅保留为开发备用资产。进入下一阶段仍需补齐真实踢击与格挡受力动作、脚底/手部接触 IK，并建立动作接触点的视觉回归。

### 人物演示验收门槛

1. 所有样例中的 actor 必须在编译期解析为 catalog 内真实资产，不允许未知模型延迟到运行时才失败；
2. 归一后角色身高为 1.78 米，模型来源标记为 `human-realistic`；
3. 双人及三人镜头分别保持 2、3 个独立 SkinnedMesh runtime；
4. 重复 seek 到相同毫秒时，角色姿势和画布像素一致；
5. Exact 验收样例只使用动作目录中有独立真实 Clip 的语义；近似动作必须带编译 warning，不能包装成真实资产能力。

## 分阶段可行性

| 阶段 | 可行性 | 判断与约束 |
|---|---:|---|
| 自然语言 → LLM | 高 | 模型能够把镜头意图翻译为 DSL，但 Prompt 不能替代编译器校验。API Key 必须放在服务端。 |
| LLM → ShotDSL | 中高 | 需要注入版本化语法、少量高质量样例、可用资产/动作目录；解析失败后把结构化诊断返回模型修复，限制最多 1–2 次。 |
| ShotDSL Parser | 高 | 采用 tokenizer → parser → semantic compiler 三段式；必须返回带行列位置的诊断，而不是静默忽略未知词。 |
| DSL → Scene IR | 高 | 统一转换为毫秒、米、弧度和 quaternion；解析引用、排序 key，并区分连续 track 与离散 event。 |
| Timeline Engine | 高 | position/scale 用 lerp，rotation 用 quaternion slerp，`hold` 保持前值，`cut` 在事件时间硬切。求值函数必须支持任意 seek。 |
| 人物动作 | 中高 | glTF 动作 clip 可交给 Three.js `AnimationMixer`；动作开始、循环、速度和 blend 由 timeline event 调度。动作资产规范是主要工作量。 |
| 语义目录与诊断 | 高 | Style、action、model catalog 已共享给编译器和运行时；别名、近似能力和缺失能力可机器诊断。 |
| 人物注视 | 中高 | `gaze` 支持 point/entity/bone 目标和绝对时间求值；眼球、颈部权重和舒适区仍待补充。 |
| Three.js 播放器 | 高 | WebGLRenderer 足以支撑 MVP；相机、实体 transform、灯光、可见性和动作 clip 均有成熟基础能力。 |
| 粗线稿 NPR | 中高 | EdgesGeometry 适合基础几何；复杂人物建议使用 depth/normal 后处理。轮廓稳定性、透明物和细小部件需要专项调优。 |
| 播放/暂停/拖拽 | 高 | 浏览器 UI 常规能力；时间轴状态应由绝对时间求值，而不是累计 delta，保证拖拽确定性。 |
| 导出当前帧 | 高 | 同源 canvas 可用 `toBlob()` 导出 PNG/JPEG；外部纹理需要正确 CORS，否则 canvas 会被污染。 |
| 导出视频 | 中 | 不放入首期；可在后续评估 WebCodecs、MediaRecorder 或服务端编码，需处理固定帧率和音频同步。 |

## 建议的模块边界

```text
packages/
  shotdsl-language/       tokenizer、parser、诊断、格式化
  scene-ir/               类型、schema、版本迁移
  timeline-engine/        track/event 求值、seek、cut
  asset-catalog/          模型、动作 clip、骨骼能力描述
  llm-translator/         Prompt、模型适配、修复回路
apps/
  web/                    Three.js 播放器、时间轴和编辑器
  api/                    LLM 凭据、限流、日志
```

Parser 与 Timeline Engine 应能在无 DOM、无 WebGL 环境下运行和测试。

## 时间轴设计要点

### 连续轨道

- `position`: `Vector3.lerp`
- `scale`: `Vector3.lerp`
- `rotation`: Euler 在编译阶段转 quaternion，运行阶段 `Quaternion.slerp`
- 数值属性：linear 或 smoothstep
- 颜色：明确工作色彩空间后插值

### 离散事件

- 相机 `cut`
- 可见性开关
- 角色动作 clip 开始/停止
- 有持续时间的 actor gaze 约束
- 音效、对白和标记
- 模型或材质切换

### 相机模式

- `fixed`: 完全由 transform track 控制；
- `lookAt`: 相机位置可动画，朝向持续对准 point/entity/bone；
- `follow`: 跟随实体并应用局部 offset；
- `orbit`: 以 target、radius、azimuth、elevation 求相机 transform。
- `impact`: 以攻击者和受击者两个 actor bone 为目标，根据攻击轴、观察侧和距离生成击打特写。

相机模式切换属于离散事件。相机 `cut` 不应通过超短 lerp 模拟。

## LLM 层建议

LLM 只做“自然语言 → ShotDSL”翻译：

1. 系统 Prompt 注入 ShotDSL 版本、语法摘要和 5–10 个覆盖性样例；
2. 动态注入资产目录、人物动作 clip 和能力约束；
3. 要求只输出一个带版本号的 DSL 文档；
4. Parser 返回 `code/message/line/column/suggestion`；
5. 失败时将诊断返回模型修复一次；
6. 仍失败则保留原文本和错误，不猜测执行。

应记录输入、模型版本、Prompt 版本、原始输出、修复输出和最终 DSL，便于回归测试。

## NPR 渲染方案比较

| 方案 | 动态 3D | 遮挡正确 | 人物蒙皮 | 性能 | 建议 |
|---|---:|---:|---:|---:|---|
| Rough.js Canvas/SVG 投影覆盖 | 有条件 | 弱 | 弱 | 中低 | 仅用于批注/静帧实验 |
| EdgesGeometry + LineSegments | 是 | 是 | 静态几何好 | 高 | 基础几何 MVP |
| Sobel 屏幕空间边缘 | 是 | 是 | 是 | 高 | MVP 主轮廓方案 |
| depth + normal 自定义 outline | 是 | 是 | 是 | 中高 | 质量增强阶段 |
| WebGL/TSL 自定义 jitter line | 是 | 是 | 是 | 中高 | 粗线风格增强阶段 |

推荐先实现稳定轮廓，再叠加抖动。每帧重新随机会产生闪烁，应使用对象 ID、线段 ID、时间量化值和 scene seed 生成稳定噪声。

## 主要风险

| 风险 | 影响 | 缓解方式 |
|---|---|---|
| LLM 生成语法正确但语义不合理 | 高 | 资产能力校验、数值边界、诊断修复、黄金样例回归 |
| DSL 过早覆盖所有电影语言 | 高 | v0.1 仅支持实体、transform、相机、clip 和 cut |
| 拖拽时间轴与顺序播放结果不同 | 高 | 纯函数式绝对时间求值；对 seek 建立快照测试 |
| 不同人物资产动作不兼容 | 高 | 统一骨骼规范，资产目录声明支持的 clips/bones |
| 粗线条动画闪烁 | 中高 | 稳定 seed、时间量化、屏幕空间抗锯齿和 temporal filtering |
| 外部资产污染 canvas 导致无法导出 | 中 | 同源代理或正确 CORS，导入时预检 |
| Three.js 高频升级破坏渲染 | 中 | 锁定版本，升级走视觉回归和迁移记录 |

## MVP 范围

首期包含：

- actor、primitive object、camera、light、ground；
- position、rotation、scale、visibility 关键帧；
- fixed/lookAt/follow/orbit/impact 相机；
- linear/smoothstep/hold 与 camera cut；
- glTF 多角色动作 clip 播放、crossfade 和程序化语义叠加；
- 播放、暂停、时间轴拖拽；
- DSL 错误定位与 JSON IR 查看；
- 导出当前帧 PNG；
- 一种稳定的黑白线稿风格。

首期不包含：

- 物理碰撞与布料；
- 自动生成 3D 模型；
- 多人 IK 接触求解；
- 音频和视频导出；
- 多人实时协作；
- 完整非线性剪辑系统。

## 后续实施重点

1. 为年龄、性别和服装 preset 引入许可明确的真实人物资产；
2. 建立带 rest-pose 校准的离线动作重定向流水线；
3. 为 talk 增加音素/时间标记到 viseme Blendshape 的输入格式和测试资产；
4. 将 gaze 扩展为头部、颈部和眼球的分层约束；
5. 增加手部触物和脚底接触 IK，并建立视觉回归。

## 推荐决策

1. 保持 catalog 是编译器和播放器唯一能力来源；
2. 不允许通过 Idle 或无关动作静默伪装模型能力；
3. 新人物先完成授权、骨架、动作和归一化验收，再提升 preset 支持等级；
4. LLM 翻译层动态注入能力矩阵和诊断码；
5. 继续以同一 DSL 样例建立解析、seek、资产和截图四类回归基线。

## 参考资料

- [Three.js Animation System](https://threejs.org/manual/en/animation-system.html)
- [Three.js KeyframeTrack](https://threejs.org/docs/pages/KeyframeTrack.html)
- [Three.js EdgesGeometry](https://threejs.org/docs/pages/EdgesGeometry.html)
- [Three.js WebGL Sobel example](https://threejs.org/examples/webgl_postprocessing_sobel.html)
- [Rough.js official repository](https://github.com/rough-stuff/rough)
- [HTMLCanvasElement.toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
