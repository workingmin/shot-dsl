# 人物 3D 展示模型层设计

## 目标

新增 `3D 人物姿态图` 模块：使用 ShotDSL 描述人物的可见外形、静态姿态和观察角度，基于可控 3D 人形资产生成保留肤色与服装配色的写实 PNG/WebP 参考图。

这里的“生成”首先指：

```text
结构化人物描述
→ 解析为 Character Spec
→ 解析或组装已登记的人形资产
→ 应用确定性姿态
→ 固定摄影棚机位渲染写实人物图片
```

它不等同于“每次根据自然语言重新生成网格”。DSL 编译必须快速、可重复且无远程副作用；文本到 3D 只能作为独立的异步资产生产能力，不能成为图片预览的必经路径。

## 调研结论

调研日期：2026-08-28。项目活跃度和商业条款会变化，接入前需要再次审计。

| 项目 | 已验证能力 | 对 ShotDSL 的启示 | 约束与结论 |
|---|---|---|---|
| [mannequin.js](https://github.com/boytchev/mannequin.js) | Three.js 中用代码创建 Male/Female/Child 关节人形，支持身高、部位尺寸、逐关节角度和可序列化 posture | 证明“参数化代理人 + 代码姿态 + 浏览器渲染”的路线成立；其 posture 模型适合作为 DSL 语义参考 | GPL-3.0，不能直接复制到本项目；应独立实现更小的参数化代理模型 |
| [three-vrm](https://github.com/pixiv/three-vrm) / [VRM](https://github.com/vrm-c/vrm-specification) | Three.js 加载 VRM，提供规范化 humanoid bones、pose、look-at、expression 等运行时接口 | VRM 1.0 适合作为外部人物资产的优先交换格式；内部骨骼语义应向 VRM 命名对齐 | `three-vrm` 为 MIT；引入会增加包体，应在需要导入 VRM 时按适配器加载 |
| [MakeHuman](https://github.com/makehumancommunity/makehuman) | 参数化人体、代理服装、姿态与离线导出 | 可用作离线制作一组轻量代理资产或 morph target 的工具，不应进入浏览器运行时 | 程序为 AGPL；仓库声明内置资产为 CC0、输出不受程序代码许可限制，但第三方资产必须逐项审计 |
| [CharMorph](https://github.com/Upliner/CharMorph) / [MB-Lab](https://github.com/animate1978/MB-Lab) | Blender 中通过 morph 创建人物，支持资产适配与最终绑定 | 可参考 body morph、服装 slot 和“生成后再绑定”的处理顺序 | 代码为 GPL；不同角色数据库许可不同，MB-Lab 派生模型默认 AGPL，不作为商用默认资产源 |
| [PoseScript](https://github.com/naver/posescript) | 自然语言与 SMPL-H 3D 姿态之间的检索、生成和修正 | 未来可把自然语言姿态解释成规范骨骼旋转，但它解决姿态而不是人物外形 | 研究型 Python/GPU 依赖和 SMPL 系列模型许可较重，不进入 Web MVP |
| [Animated Drawings](https://github.com/facebookresearch/AnimatedDrawings) | YAML 配置角色、动作和场景；从手绘人物图检测、分割、绑定并用 BVH 动作输出视频 | 证明“源素材分析 → 校正 → 绑定 → 配置化渲染”应该拆成可检查阶段 | 主要是 2D cutout 动画且仓库已归档，只作为流程参考 |
| [TripoSR](https://github.com/VAST-AI-Research/TripoSR) | 单图重建 3D 网格，MIT，默认约需 6GB GPU 显存 | 可作为未来“参考图转 3D 候选资产”的离线实验 | 输出不是稳定的人形拓扑或标准骨架，不能直接承诺姿态与动作能力 |
| [TRELLIS](https://github.com/microsoft/TRELLIS) / [Hunyuan3D-2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2) | 文本/图片条件的 3D 资产生成，可输出 mesh/GLB；提供本地推理或 API 示例 | 适合做可替换的生成 Provider，不适合作为 Character IR 或运行时的一部分 | GPU、模型权重、生成时间和拓扑均不稳定；生成后仍需重拓扑、绑定和质量门禁 |
| [Ready Player Me](https://github.com/readyplayerme/rpm-react-avatar-creator) | 商业 Avatar Creator 通过 iframe 定制 full-body avatar，导出 URL；[Visage](https://github.com/readyplayerme/visage) 可在 Web 中加载 GLB、pose 和 animation | 可作为外部角色创建器或 GLB Provider，接入体验成熟 | 依赖商业服务、租户配置和使用条款；人物形象由用户交互创建，不是 ShotDSL 的确定性参数模型 |
| [Avaturn](https://docs.avaturn.me/docs/integration/overview/) | 可嵌入人物配置器，完成后向应用返回人物文件；提供 Three.js、Web SDK、REST API 和 GLB/VRM 工作流 | 可作为可选的外部人物资产入口，VRM 转换路径与本设计兼容 | 高级集成受商业方案约束，必须固定并持久化导出文件，不能运行时依赖临时 URL |
| [Meshy API](https://docs.meshy.ai/en/api/text-to-3d) | 异步 Text-to-3D preview/refine，输出 GLB 等格式；另有 [Rigging API](https://docs.meshy.ai/en/api/rigging) 为标准双足人物绑定并返回 GLB/FBX | Provider API 的任务状态、结果持久化和“生成/绑定分离”可直接参考 | 自动绑定要求清晰的双足结构、纹理模型和正确朝向，且存在面数、费用、限流与失败概率 |

没有一个方案能同时满足“自由文本外形、稳定人形拓扑、标准骨架、确定性重现、低延迟浏览器运行和清晰商用许可”。因此模型层必须把外形描述、资产生产、资产校验和图片渲染分开。

## 产品边界

### 首版支持

- 单人物、单视图、静态 PNG/WebP；
- 写实人物 GLB/VRM 的原始 PBR 肤色、头发和服装材质；
- 身高、体型、年龄段、发型和服装 preset；
- 语义姿态和动作片段的归一化采样；
- 正面、侧面、背面和三分之四角度；
- 全身、四分之三身、半身和头像构图；
- 本地登记资产和参数化代理人，渲染不依赖外部 API；
- 固定输出尺寸、固定资产 revision 和可重复导出。

### 首版不支持

- 根据一段自然语言直接生成全新可绑定人物模型；
- 程序化生成皮肤细节、眼睛纹理和细粒度面部身份；
- 任意服装生成、布料仿真、头发动力学；
- 多人物合照、角色表情板和多视图 character sheet；
- 未经过校验的远程 GLB/VRM URL 直接进入渲染器。

首版材质来源固定为 `asset-original`：运行时保留资产中的 base color、normal、roughness、metalness、alpha 等 PBR 数据，不由渲染器统一改色。肤色和服装配色首先由已登记资产或 wardrobe preset 决定；DSL 直接覆盖材质颜色可在后续加入，但必须建立明确的材质 slot，不能根据 mesh 名称猜测皮肤与服装。

## 推荐 DSL

新增独立根文档类型，不用零时长 `scene` 模拟静态图片。ShotDSL `0.1` 保持兼容，新模块使用 `0.2`：

```shotdsl
shotdsl 0.2

character-image scout_reach {
  size [1024px, 1024px]
  format png
  background white
  ground shadow
  render realistic-studio
}

character subject {
  model "realistic-adult-neutral-v1"
  archetype adult-neutral
  height 1.76m
  build slight
  hair short
  wardrobe "field-jacket-trousers"
  materials asset-original
  pose "reach"
  sample 0.62
  rotation [0deg, -25deg, 0deg]
}

view main {
  framing full-body
  angle three-quarter-left
  lens 70mm
  elevation 5deg
  padding 0.08
}
```

首版枚举应保持封闭：

| 属性 | 首版值 |
|---|---|
| `model` | 已登记且通过审计的写实 GLB/VRM asset id |
| `archetype` | `child-neutral`、`adult-neutral`、`older-adult-neutral` |
| `build` | `slight`、`average`、`broad` |
| `hair` | `none`、`short`、`medium`、`long-tied` |
| `wardrobe` | 资产目录中的轮廓 preset id |
| `materials` | 首版固定为 `asset-original` |
| `pose` | 当前动作目录中的语义动作或 pose preset id |
| `sample` | 动作片段归一化位置 `0..1` |
| `framing` | `full-body`、`three-quarter`、`bust`、`head` |
| `angle` | `front`、`three-quarter-left`、`left`、`right`、`back` |
| `ground` | `none`、`shadow`、`grid` |

`archetype` 描述视觉比例模板，不代表人物身份。精确关节编辑后续通过独立 `pose` block 增加，不在首版同时引入。

## Character Image IR

静态人物图片不能塞进当前 Scene IR。Parser 共用 tokenizer、value parser 和 diagnostics，再按根 block 分派：

```text
scene           → Storyboard Scene IR
character-image → Character Image IR
```

建议 IR：

```js
{
  kind: 'character-image',
  version: '0.2',
  image: {
    id: 'scout_reach',
    width: 1024,
    height: 1024,
    format: 'png',
    background: 'white',
    ground: 'shadow',
    renderProfile: 'realistic-studio'
  },
  subject: {
    asset: {
      id: 'realistic-adult-neutral-v1',
      revision: 'sha256:...',
      provider: 'catalog'
    },
    appearance: {
      archetype: 'adult-neutral',
      heightM: 1.76,
      build: 'slight',
      hair: 'short',
      wardrobe: 'field-jacket-trousers',
      materials: 'asset-original'
    },
    pose: { id: 'reach', sample: 0.62 },
    rotation: [0, -0.436332, 0]
  },
  view: {
    framing: 'full-body',
    angle: 'three-quarter-left',
    lensMm: 70,
    elevationRad: 0.087266,
    padding: 0.08
  }
}
```

IR 必须引用已解析的资产 revision。相同 IR、资产 revision、renderer revision 和输出尺寸共同构成渲染缓存键。

## 模型运行时

### 统一人形接口

`CharacterRuntime` 当前承担 GLB 加载、骨架映射、动画和资产材质克隆。新增模块前先抽象内部接口：

```js
HumanoidInstance {
  object3D
  capabilities
  getBounds()
  resolveJoint(semanticJoint)
  applyPose(poseSample)
  applyAppearance(appearance)
  dispose()
}
```

提供三种 adapter：

1. `GltfHumanoidAdapter`：包装当前 `CharacterRuntime`，兼容现有 GLB 和动作片段。
2. `ParametricMannequinAdapter`：独立实现的程序化代理人，使用简单体块和统一关节；只作为加载失败诊断和内部 fallback，不作为写实图片的默认输出。
3. `VrmHumanoidAdapter`：后续基于 `three-vrm` 加载 VRM 1.0，并把 VRM normalized humanoid pose 映射到内部语义关节。

不要复制 `mannequin.js` 的 GPL 实现。可借鉴其公开 API 所体现的概念，使用 Three.js 基础几何和本项目自己的比例、关节限制及姿态数据重新实现。

人物运行时只负责保留资产原始 PBR 材质，包括肤色、服装颜色及其 base color、normal、roughness、metalness 贴图。渲染风格由上层 renderer 决定：`CharacterImageRenderer` 直接使用原始写实材质，`ShotPlayer` 在自己的 storyboard 管线中临时应用黑白材质覆盖。黑白策略不能再写入通用 `CharacterRuntime`。

### 资产清单

每个人物资产必须有机器可验证的 manifest：

```js
{
  id: 'realistic-adult-neutral-v1',
  revision: 'sha256:...',
  uri: '/assets/characters/realistic-adult-neutral-v1.glb',
  format: 'glb',
  license: {
    id: 'CC0-1.0',
    sourceUrl: '...',
    distribution: 'allowed'
  },
  rig: {
    profile: 'shotdsl-humanoid-v1',
    restPose: 't-pose',
    upAxis: '+Y',
    forwardAxis: '+Z',
    rootMotion: 'in-place'
  },
  geometry: {
    heightM: 1.78,
    triangles: 12000,
    morphTargets: ['build-slight', 'build-broad']
  },
  slots: ['hair', 'wardrobe'],
  poses: ['idle', 'walk', 'run', 'crouch', 'talk', 'reach', 'look-around', 'fall']
}
```

应用只读取自有稳定媒体地址。商业 Provider 返回的签名 URL 必须下载、校验、记录许可后再发布到 `/media/characters/<asset-id>/<revision>/model.glb`。

### 生成资产门禁

任何外部或 AI 生成资产进入目录前必须执行：

```text
来源与许可记录
→ 文件类型、大小和内容安全检查
→ +Y up / +Z forward / 米制单位归一化
→ 网格完整性、面数、材质和纹理预算检查
→ 必需 humanoid joints 与 bind pose 检查
→ skin weight、关节极限和基础 pose 测试
→ 写实材质与人物轮廓的正面/侧面/三分之四视图检查
→ 固定 revision、生成缩略图并发布
```

外部生成失败时不能静默替换成默认人形；应保留明确的 `unresolved`、`validating`、`rejected` 或 `ready` 状态。

## 资产生产与图片渲染分离

图片 DSL 编译不得调用商业 API。生成式外形需求走独立资产任务：

```text
Character Asset Spec / prompt
→ POST /api/v1/character-assets
→ provider job
→ ingest + humanoid validation
→ immutable asset id + revision
→ character-image DSL 引用该资产
```

这样可以避免每次编辑 DSL 都重新计费、得到不同网格或阻塞预览，也能保证旧项目继续引用原 revision。

## 渲染器

新增 `CharacterImageRenderer`，复用当前人物资产管理、绝对动画采样、程序化 pose overlay 和 bounds 计算，但不复用 Scene IR、时间轴播放器、storyboard 材质或默认轮廓效果。它使用资产原始 PBR 材质以及独立的摄影棚灯光、环境反射、色调映射和曝光配置。

- 使用固定尺寸 offscreen canvas/render target，导出尺寸不受 CSS viewport 影响；
- 根据姿态后的 bounds 和 `framing + padding` 计算相机，不依赖手写相机距离；
- 首版支持白底/透明底、柔和接触阴影和资产原始肤色/服装配色，轮廓效果默认关闭；
- 渲染前等待字体、模型、轮廓和地面资源全部 ready；
- PNG 使用无损输出，WebP 暴露明确 quality，透明背景只允许 PNG/WebP；
- 缓存键为 `hash(CharacterImageIR + assetRevision + rendererRevision)`。

## URL 与 API

```text
/                         → /storyboard/
/storyboard/              → 动态分镜编辑器
/character-image/         → 3D 人物姿态图编辑器
/characters/              → 人物资产目录
/characters/:assetId/     → 人物资产、revision、许可和能力
/renders/:renderId/       → 已持久化图片结果
```

初期示例使用短 query，不把完整 DSL 放进 URL：

```text
/character-image/?example=urban_investigator
```

当前内置示例覆盖都市调查员、退休木匠、急诊医生、自行车快递员和近地轨道飞行员。示例只载入人物描述，不会自动发起可能产生费用的 Provider 生成任务；用户确认后再手动提交生成。

本地草稿分 namespace：

```text
shotdsl:storyboard:draft
shotdsl:character-image:draft
```

未来服务端接口：

```text
POST /api/v1/character-renders
GET  /api/v1/character-renders/:renderId

POST /api/v1/character-assets
GET  /api/v1/character-assets/:assetId
GET  /api/v1/character-assets/:assetId/revisions/:revision
```

Provider API key 只保存在服务端。用户输入的远程 URL 必须防 SSRF，上传和生成的人物资产必须记录来源、用户授权与删除策略。

## 实施顺序

1. 定义 ShotDSL `0.2` 的 `character-image`、Character Image IR 和诊断测试。
2. 从 `CharacterRuntime` 提取 `HumanoidInstance` 接口及 GLB adapter，不改变现有 storyboard 行为。
3. 引入并审计至少一套写实 GLB/VRM 人物资产，验证肤色、头发透明材质、服装贴图和标准静态站姿。
4. 实现固定分辨率 `CharacterImageRenderer`、PBR 摄影棚渲染、构图计算和 PNG/WebP 导出。
5. 增加 `/character-image/` 多入口构建、独立草稿存储和浏览器视觉回归。
6. 增加 VRM adapter 与经审计的外部资产导入。
7. 最后才评估 Ready Player Me、Avaturn 或 Meshy 等 Provider；生成式 Provider 始终保持可移除。

## 验收标准

- 同一 DSL、资产 revision 和 renderer revision 重复导出像素一致；
- 最长属性值、错误状态和加载状态不改变画布固定尺寸；
- 所有支持姿态在正面、侧面和三分之四视图中不穿模、不截肢；
- 原始肤色、头发和服装贴图在预览与导出中保持一致，不被 storyboard 材质覆盖；
- 人物全身构图满足 padding，脚底与地面接触稳定；
- 未登记模型、未知 preset、缺失骨骼和不支持 pose 均产生可定位诊断；
- 资产审计能阻止许可缺失、hash 改变、面数超限和骨架不完整的文件；
- 现有 `/storyboard/` 的加载、seek、PNG/WebM 和人物动作测试保持通过。

## 当前实施状态

第一条可运行链路已经实现：

```text
自由文本
→ 服务端 Meshy preview / refine
→ GLB 大小与魔数检查
→ .shotdsl-data 本地持久化
→ PBR 静态查看
→ 正面 / 侧面 / 背面三视图 PNG
```

当前实现是 Provider 集成原型，不代表前述资产门禁已经完成。下一步必须补充人体完整性、朝向、静态站姿、拓扑、材质 slot、来源许可和内容安全检查，再把生成资产加入长期人物目录。ShotDSL `0.2` 的 `character-image` Parser/IR 也尚未实现；当前页面直接提交自由文本 Character Asset Spec。
