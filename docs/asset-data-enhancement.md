# 人物资产数据增强方案

## 目标与原则

资产增强的目标不是让更多模型名“编译通过”，而是让年龄、性别、服装、动作、口型和骨架能力都有可验证的数据支撑。增强后的每个人物必须同时满足：来源和授权可追溯、外观画像明确、骨架语义完整、动作能力可枚举、运行时体量可控、随机 seek 可复现。

当前机器可读入口位于 `src/shotdsl/catalog.js`：

- 每个真实 GLB 声明 `source`、`license`、`profile`、`rig`、`speech`、语义骨骼和动作映射；
- `ASSET_ENHANCEMENT_TARGETS` 声明 5 个尚缺人物画像及其动作、骨骼、viseme 门槛；
- `generic_*` 仍是 approximate alias，只有真实资产完成入库验收后才能提升为 canonical model。

运行以下命令检查 catalog 与本地 GLB 是否一致：

```bash
npm run assets:audit
npm run assets:audit -- --json
```

审计会直接读取 GLB JSON chunk，验证动画名、Three.js 清洗后的节点名、morph target、授权元数据和目录引用。它已进入 `npm run check`。

## 数据增强的四条路径

### 1. 真实基础人物与服装变体

优先引入许可明确、可再分发的统一拓扑人物族，而不是收集彼此无关的单个模型。第一批目标：

| Target | 外观 | 必需场景 |
|---|---|---|
| `business-male-adult` | 成年男性、商务服装 | 密室分析员 / 现代剧情预演 |
| `business-female-adult` | 成年女性、商务服装 | 密室审讯 / 现代剧情预演 |
| `traditional-male-older-adult` | 老年男性、传统/日常服装 | 非遗手艺人 / 宫宴角色 |
| `casual-male-teen` | 青少年男性、日常服装 | 四人群像 / 道具传递 |
| `casual-female-adult` | 成年女性、日常服装 | 面馆顾客 / 四人群像 |

同一人物族应共享骨架、UV 和面部 Blendshape 命名。服装优先作为蒙皮附件或材质/网格变体，不复制整套动作数据。

### 2. 同拓扑外观增强

在有合法基础模型和统一拓扑的前提下，通过离线方式扩充：

- 年龄：体型 Blendshape、面部法线/粗糙度、发色与皮肤纹理；
- 性别与体型：受限范围的 body shape，保持关节中心和骨长校准；
- 服装：商务、日常、传统服装网格与材质变体；
- 发型与配饰：独立附件，必须验证轮廓、蒙皮和相机近景穿插。

不允许仅靠缩放 mannequin 或改颜色就把 approximate preset 标记为真实年龄/性别资产。生成式纹理或网格只能用于来源许可允许的基础资产，并保留生成工具、版本、Prompt/参数和人工审核记录。

### 3. 动作数据增强与离线重定向

建立一个独立的 canonical motion library，动作源不直接绑定最终人物：

```text
授权动作源
  → 统一骨骼语义
  → rest-pose / 骨长 / 关节轴校准
  → 根运动与脚底归零
  → 离线 retarget 到目标骨架
  → 手脚接触与穿插修正
  → glTF 压缩和 catalog 映射
```

每个导出动作必须记录：

- source asset、license、checksum 和处理工具版本；
- source/target rig family 与 rest pose；
- fps、duration、loop、root motion 策略；
- 接触帧、effector bone、target bone；
- 最大脚滑、地面穿透和关节角异常。

浏览器运行时不执行未经校准的跨 bind-pose retarget。不同骨架之间只能使用离线产物；同骨架人物可以共享动画 buffer。

### 4. 对话、viseme 与 gaze 数据

对话资产至少包含 15 个标准 viseme：

```text
sil PP FF TH DD kk CH SS nn RR aa E I O U
```

入库时将模型原始 Blendshape 名映射到标准 viseme，并检查左右嘴角、下颌、闭唇和元音极值。运行时输入建议采用绝对时间 cue：

```json
{
  "actorId": "employee",
  "cues": [
    { "timeMs": 1200, "viseme": "sil", "weight": 0 },
    { "timeMs": 1280, "viseme": "PP", "weight": 0.85 }
  ]
}
```

当前 `talk` 已能检测并驱动 `jawOpen`、`mouthOpen`、`viseme_aa`、`viseme_oh` 等通道，但内置真人资产没有经验证的 viseme。正式对话数据应使用音素/viseme cue，而不是用周期函数假装语音同步。

`gaze` 数据增强应进一步提供眼球、头部、颈部三层权重、最大舒适角和眨眼通道；当前只有确定性的头部约束。

## 建议目录结构

源资产、处理产物和浏览器运行资产应分离：

```text
assets-source/characters/<asset-id>/
  source/                 原始下载，不直接发布
  LICENSE.txt
  provenance.json        来源、作者、URL、checksum
  processing.json        工具版本、retarget/压缩参数
  qa.json                骨骼、动作、viseme、接触测试结果

public/assets/characters/
  <asset-id>.glb          仅放通过验收的运行时产物

src/shotdsl/catalog.js    运行能力与 alias/preset
```

大体积源资产和中间文件应使用 Git LFS 或外部版本化对象存储；运行时 GLB 继续保持同源、可 checksum、可离线加载。

## 入库流水线

1. 授权隔离：确认允许修改、再分发和商业使用；不明确的资产只能进入 quarantine。
2. 原始冻结：保存原文件、checksum、来源页面快照和作者信息。
3. 几何处理：单位、坐标系、法线、材质、贴图色彩空间和 LOD。
4. 骨架处理：语义骨骼、rest pose、骨长、根节点、脚底高度和 1.78 米归一策略。
5. 动作处理：离线 retarget、循环接缝、根运动、接触帧和异常姿态。
6. 面部处理：Blendshape 名称、viseme 极值、眨眼和 gaze 通道。
7. 压缩导出：纹理尺寸、Meshopt/Draco 选择、动画采样率和文件体积预算。
8. 自动审计：`npm run assets:audit`、checksum、Parser/Runtime 测试。
9. 视觉验收：近景、侧脸、轮廓模式、动作接触、重复 seek 和 PNG 回归。
10. Catalog 晋级：只有全部门槛通过后，alias 才能指向新 canonical model，并从 approximate 提升为 exact。

## 验收指标

| 维度 | 最低门槛 |
|---|---|
| 授权 | 来源、作者、许可、修改和再分发范围完整 |
| 几何 | 无破面/穿帮，人物归一后脚底为 0，近景轮廓稳定 |
| 骨架 | 所有 requiredBones 可解析，重复 seek 姿势一致 |
| 动作 | 必需动作不回退 Idle；脚滑、穿地和关节翻转通过人工及自动检查 |
| 对话 | requiredVisemes 全部映射；闭唇、元音和下颌极值可辨识 |
| 性能 | 单人物首次加载、三人物并发和纹理显存满足浏览器预算 |
| 确定性 | 任意时间 seek 后骨骼、morph 和 gaze 状态可复现 |

## 实施顺序

第一批服务当前 7 个专业预演场景：先补面馆、宫宴、密室、四人群像和非遗场景所需的年龄、服装与身份差异，再补统一 dialogue 动作包与 viseme。第二批补战斗人物的同骨架拳击/受击动作。第三批引入手部触物、脚底接触 IK 和更大规模选角库。

这一顺序避免资产数量先膨胀、能力和授权却不可验证，也与当前短镜头产品范围一致。
