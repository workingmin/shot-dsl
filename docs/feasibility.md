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

v0.3 已完成多人 glTF 骨骼人物技术验证：`GLTFLoader` 加载 CC0 角色，`SkeletonUtils.clone` 生成独立骨架，`AnimationMixer` 根据 Scene IR 的绝对时间采样 Clip，并在 `blend` 窗口混合前后动作。人物资产会执行脚底归零和 1.78 米身高归一；蒙皮角色使用 OutlineEffect，静态几何保留 EdgesGeometry 双描边。

当前 `robot-expressive` 仅是技术验证资产。进入正式美术阶段仍需要统一 humanoid 骨架、真人比例低模、打斗动作目录及脚底/手部 IK。

## 分阶段可行性

| 阶段 | 可行性 | 判断与约束 |
|---|---:|---|
| 自然语言 → LLM | 高 | 模型能够把镜头意图翻译为 DSL，但 Prompt 不能替代编译器校验。API Key 必须放在服务端。 |
| LLM → ShotDSL | 中高 | 需要注入版本化语法、少量高质量样例、可用资产/动作目录；解析失败后把结构化诊断返回模型修复，限制最多 1–2 次。 |
| ShotDSL Parser | 高 | 采用 tokenizer → parser → semantic compiler 三段式；必须返回带行列位置的诊断，而不是静默忽略未知词。 |
| DSL → Scene IR | 高 | 统一转换为毫秒、米、弧度和 quaternion；解析引用、排序 key，并区分连续 track 与离散 event。 |
| Timeline Engine | 高 | position/scale 用 lerp，rotation 用 quaternion slerp，`hold` 保持前值，`cut` 在事件时间硬切。求值函数必须支持任意 seek。 |
| 人物动作 | 中高 | glTF 动作 clip 可交给 Three.js `AnimationMixer`；动作开始、循环、速度和 blend 由 timeline event 调度。动作资产规范是主要工作量。 |
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
- 音效、对白和标记
- 模型或材质切换

### 相机模式

- `fixed`: 完全由 transform track 控制；
- `lookAt`: 相机位置可动画，朝向持续对准 point/entity/bone；
- `follow`: 跟随实体并应用局部 offset；
- `orbit`: 以 target、radius、azimuth、elevation 求相机 transform。

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
- fixed/lookAt/follow/orbit 相机；
- linear/smoothstep/hold 与 camera cut；
- glTF 单角色动作 clip 播放；
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

## 实施节奏与估算

按 1 名熟悉 TypeScript/Three.js 的工程师估算：

1. ShotDSL v0.1、Parser、诊断和 IR：1–1.5 周；
2. Timeline Engine、seek、cut 和单元测试：1–1.5 周；
3. Three.js 场景、相机、动作与播放器 UI：1.5–2 周；
4. LLM 翻译与一次修复回路：0.5–1 周；
5. NPR 线稿、帧导出和视觉回归：1–1.5 周。

可评审 MVP 约 5–7 人周。若先不接人物动作资产和 LLM，可在约 2–3 周得到 DSL 驱动的动态几何体播放器。

## 推荐决策

1. 接受总体产品方向；
2. 将 `RoughJS-WebGL` 改为 Three.js NPR 渲染层；
3. 第一里程碑只做手写 ShotDSL → 动态播放器；
4. Parser 和 Timeline Engine 稳定后再接 LLM；
5. 以同一 DSL 样例建立解析、seek 和截图三类回归基线。

## 参考资料

- [Three.js Animation System](https://threejs.org/manual/en/animation-system.html)
- [Three.js KeyframeTrack](https://threejs.org/docs/pages/KeyframeTrack.html)
- [Three.js EdgesGeometry](https://threejs.org/docs/pages/EdgesGeometry.html)
- [Three.js WebGL Sobel example](https://threejs.org/examples/webgl_postprocessing_sobel.html)
- [Rough.js official repository](https://github.com/rough-stuff/rough)
- [HTMLCanvasElement.toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
