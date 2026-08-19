# ShotDSL 支持能力评估

## 评估结论

当前 ShotDSL 已从固定白名单升级为 catalog 驱动：style、动作和人物模型在编译期完成别名规范化，并按具体模型验证能力。与此前相比，常见外部表达的兼容性和诊断真实性显著提高；剩余短板主要是人物外观资产、真实口型、目标约束 IK 和跨骨架动作重定向，而不是 Parser 语法。

底层资产补齐的机器可读目标、审计方式和入库流水线见 [人物资产数据增强方案](asset-data-enhancement.md)。

| 维度 | 当前等级 | 判断 |
|---|---:|---|
| Style 表达 | 中高 | 4 个真实渲染 preset，并兼容常见下划线/旧名称 |
| 动作词汇 | 中高 | 21 个规范动作和多组自然语言别名 |
| 模型级动作校验 | 高 | exact / procedural / approximate / unsupported 四级能力，不再静默 Idle |
| 人物资产多样性 | 低 | 只有 3 个真实 GLB，其中真人模型 2 个，年龄、性别、服装 preset 仍是近似映射 |
| 注视能力 | 中 | 支持 actor → point/entity/bone 的确定性头部 gaze；没有眼球单独控制 |
| 对话表现 | 中低 | `talk` 有确定性身体手势和可选 morph target 驱动；当前真人资产没有可用口型 morph |
| 动作重定向 | 低 | 统一了语义骨骼目录，但没有在浏览器中执行跨 bind-pose retarget |
| 接触与 IK | 低 | impact 相机可读真实骨骼，手部触物和脚底接触仍依赖人工走位 |

## Style

| 规范值 | 实现 | 支持等级 |
|---|---|---:|
| `cinematic` | PBR、贴图、环境反射、ACES、电影布光、软阴影 | 完整 |
| `rough-ink` | 平面化材质、OutlineEffect、静态几何双描边 | 完整 |
| `wireframe` | 真实材质 wireframe、技术预览背景和网格 | 完整 |
| `cinematic-outline` | PBR 表面与 OutlineEffect 组合 | 完整 |

兼容别名包括 `rough_ink`、`storyboard`、`wire-frame`、`3d_cinematic`、`cinematic_wireframe`、`3d_cinematic_wireframe` 及连字符变体。别名只改变输入兼容性；Scene IR 和运行时始终使用规范值。

`3d_cinematic_wireframe` 规范化为 `cinematic-outline`，因为它表达的是保留三维电影材质同时显示轮廓，而不是只显示三角形边线。需要纯网格线框时应使用 `wireframe`。

## 动作

规范动作共 21 个：

```text
idle guard walk march run stretch dance side-step jumping-jacks
crouch pushup cooldown punch cross hook kick hit-face fall
talk reach look-around
```

常用输入别名：

| 输入 | 规范动作 |
|---|---|
| `stand`、`standing` | `idle` |
| `walking` | `walk` |
| `running`、`sprint`、`jog` | `run` |
| `speak`、`speaking`、`talking`、`dialogue` | `talk` |
| `grab`、`extend-hand` | `reach` |
| `look`、`looking`、`glance` | `look-around` |
| `jab` | `punch` |

### 模型动作矩阵

| 模型 | Exact | Procedural | Approximate | Unsupported |
|---|---|---|---|---|
| `human-mannequin` | idle、guard、walk、run、stretch、dance、jumping-jacks、crouch、pushup、cooldown、punch、cross、hook、hit-face、fall | talk、look-around | march、side-step、kick、reach | 无 |
| `game-ready-soldier` | idle、walk、run | talk、reach、look-around | march | 其余动作 |
| `robot-expressive` | idle、walk、run、dance、punch、fall | talk、reach、look-around | guard、march、stretch、side-step、jumping-jacks、crouch、cooldown、cross、hook、kick、hit-face | pushup |

`procedural` 表示运行时在基础动画之后叠加确定性骨骼动作。`talk` 还会驱动名称匹配 `jawOpen`、`mouthOpen`、`viseme_aa` 或 `viseme_oh` 的 morph target；当前内置真人资产不包含这些通道，因此现阶段主要表现为头部和手臂谈话动作，不应称为完整口型同步。

`approximate` 必须产生 `W_APPROXIMATE_CLIP`。例如 mannequin 的 `kick` 仍使用最接近的搏击 Clip，不能作为真实踢击验收样例。

## 人物模型

### 真实资产

| 模型 ID | 类型 | 真实动作特点 | 限制 |
|---|---|---|---|
| `human-mannequin` | 真人比例动作原型 | 16 个覆盖体操和搏击的 Clip | 材质简单，无性别/服装/口型变体 |
| `game-ready-soldier` | 带贴图游戏角色 | 原生 Idle / Walk / Run | 缺少表演和搏击动作 |
| `robot-expressive` | 风格化机器人 | 表情化动作较多 | 非真人比例，不适合真人选角 |

### 兼容 preset

以下名称可以编译，但会规范化为 `human-mannequin` 并产生 `W_MODEL_ALIAS`：

```text
humanoid
humanoid-male
humanoid-female
generic_male_business
generic_female_business
generic_female
generic_young_male
generic_old_male
generic_teen_male
```

这些 preset 解决的是 DSL 和外部样例兼容，不代表仓库已经拥有相应年龄、性别或商务服装资产。Scene IR 会同时保留规范 `model` 和原始 `requestedModel`，便于未来资产解析器替换为真实角色。

## 注视与表演

`gaze` 支持目标 point、actor、object 和语义骨骼：

```shotdsl
gaze 3s actor witness target object photo duration 4s strength 0.9
gaze 8s actor witness target actor detective bone "head" duration 2s
```

注视在动作采样后叠加，具有明确起止时间，可随机 seek。当前实现只调整头部语义骨骼；眼球、颈部权重分配、视线舒适区和眨眼尚未实现。

## 编译诊断策略

| 情况 | 结果 |
|---|---|
| 未知 style / action / model | Error，拒绝生成可播放 IR |
| 已知别名 | Warning，规范化并保留 requested 值 |
| 模型近似支持动作 | Warning，明确真实资产 Clip |
| 模型不支持动作 | `E_MODEL_CLIP`，拒绝播放 |
| glTF 目录指向不存在的 Clip | 运行时资产错误，不回退 Idle |
| 模型文件加载失败 | 显式 asset warning，并使用程序化人物 fallback |

## 下一步资产门槛

要把人物资产多样性、对话表现和重定向能力提升到“高”，至少需要：

1. 引入许可明确的成年男性、成年女性、老人、青少年和商务服装真人角色；
2. 每类角色提供统一命名的 Idle / locomotion / talk / reach / look / reaction 动作包；
3. 离线完成 rest-pose、骨长和根运动校准，输出与目标人物同骨架的 glTF；
4. 提供 jaw/viseme morph target 或音素到 Blendshape 的可验证映射；
5. 增加手部目标、脚底接触和 gaze 的视觉回归测试。

在这些资产进入仓库前，兼容 preset 必须继续以 warning 标识，不能提升为 exact。
