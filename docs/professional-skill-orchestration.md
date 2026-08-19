# 专业技能调度设计

## 结论

ShotDSL 适合吸收 DramaClaw 的**技能契约和审校闭环**，不适合直接复制它的小说到成片流水线。当前工程的稳定核心是单场景 3D 预演，因此本轮把调度边界收敛为：资产预检 → 场面调度 → 动作编排 / 摄影设计 → 连续性审校 → 预演质检。

实现分为两层：

- `beat` 描述某一时间范围内的戏剧意图、情绪、视觉焦点和连续性要求；
- `workflow` 描述由哪些专业技能处理哪些 scope、依赖谁，以及结果是只读审校还是候选 patch。

编译器会校验并输出 `professional-skill.v1` 调度契约，但**当前不会调用 LLM，也不会自动修改 ShotDSL**。这让未来 CLI、Agent 或可视化工作流可以共用同一份契约，同时保持播放器确定性。

## 从 DramaClaw 借鉴的工程模式

参考 DramaClaw 当前公开实现，值得迁移的是：

1. 技能注册表明确声明 provider、输入、输出、scope 和能力权限；
2. 规划与审校分离，生成结果先成为候选产物；
3. 图变更默认只提出 patch，不自动应用；
4. 长链路用显式阶段、依赖、失败策略和检查点组织；
5. 资产、空间、镜头和最终 QC 使用不同专业角色，不由单一“大导演提示词”包办。

ShotDSL 没有复制 DramaClaw 的实现代码或完整业务流程，只采用了这些通用调度思想，并按当前 Scene IR 重新设计了小型契约。

本次对照基于 DramaClaw commit `2d0752c`：项目[能力总览](https://github.com/dramaclaw/dramaclaw/blob/2d0752c431f01bdbf8a9a41b7eb172b5a6f7f14e/docs/zh/concepts/features.md)、[任务与端口架构](https://github.com/dramaclaw/dramaclaw/blob/2d0752c431f01bdbf8a9a41b7eb172b5a6f7f14e/docs/zh/concepts/architecture.md)和 [Freezone 技能契约](https://github.com/dramaclaw/dramaclaw/blob/2d0752c431f01bdbf8a9a41b7eb172b5a6f7f14e/src/novelvideo/freezone/skill_registry.py)。

## 当前纳入的技能

| Skill ID | 角色 | 模式 | 适用 scope | 当前工程状态 |
|---|---|---|---|---|
| `previs.asset-supervisor` | 资产监制 | `review` | scene / actor | Catalog 与编译诊断已有基础，可先做确定性实现 |
| `previs.blocking-director` | 场面调度 | `propose` | scene / beat | 已有 position / rotation / gaze 表达，待接 Agent 执行器 |
| `previs.action-choreographer` | 动作指导 | `propose` | scene / timeline / beat / actor | 已有动作目录、模型能力和 contact 元数据，待接 Agent 执行器 |
| `previs.cinematographer` | 摄影指导 | `propose` | scene / timeline / beat / camera | 已有五种相机和 cut/key，待接 Agent 执行器 |
| `previs.continuity-supervisor` | 场记 / 连续性监制 | `review` | scene / timeline / beat | 先做规则审校，后续补 180° 轴线和动作匹配分析 |
| `previs.qc` | 预演质检 | `review` | scene / timeline | 现有 Parser、语义校验、seek/smoke 可逐步汇总为报告 |

`provider` 是执行能力提示，不等于执行状态：`compiler` / `analyzer` 表示可由确定性代码承载，`agent` 表示需要后续接入结构化 Agent。所有技能都声明 `applyPatch: false`。

## 语法

```shotdsl
beat order_exchange {
  from 4.2s
  to 9.2s
  intent "通过正反打和号码牌特写完成点单信息的视觉交接"
  emotion "短促、明确"
  focus object order_token
  continuity preserve
  notes "保持店主与顾客的视线方向，不跨越柜台形成的动作轴"
}

workflow professional_previs {
  approval manual
  failure stop
  dispatch previs.asset-supervisor as assets scope scene mode review
  dispatch previs.blocking-director as blocking scope beat:order_exchange mode propose after assets
  dispatch previs.action-choreographer as performance scope timeline mode propose after blocking
  dispatch previs.cinematographer as camera_plan scope beat:order_exchange mode propose after blocking
  dispatch previs.continuity-supervisor as continuity scope scene mode review after performance,camera_plan
  dispatch previs.qc as final_qc scope scene mode review after continuity
}
```

### Beat

- `from` / `to`：必填，必须位于 scene duration 内；
- `intent`：必填，描述可被镜头和表演验证的戏剧目标；
- `emotion`：可选，作为表演和节奏上下文；
- `focus`：可选，支持 point / actor / object / bone target；
- `continuity`：`preserve` 或 `reset`，默认 `preserve`；
- `notes`：可选的执行约束，不进入播放器求值。

### Workflow

- 一个文档最多一个 workflow；
- `approval manual|auto`：只读 workflow 可自动通过；只要存在 `propose`，就必须是 `manual`；
- `failure stop|continue`：某一步失败时停止或继续独立步骤；
- `scope`：`scene`、`timeline`、`beat:<id>`、`actor:<id>`、`object:<id>`、`camera:<id>`；
- `after`：逗号分隔的 dispatch ID，编译器校验未知依赖、自依赖和环；
- `review` 只输出报告；`propose` 只输出 `shotdsl-patch` 候选，并标记 `requiresApproval: true`。

## Scene IR 契约

编译结果新增：

```json
{
  "beats": {
    "order_exchange": {
      "fromMs": 4200,
      "toMs": 9200,
      "intent": "...",
      "continuity": "preserve"
    }
  },
  "workflow": {
    "schemaVersion": "professional-skill.v1",
    "id": "professional_previs",
    "approval": "manual",
    "failure": "stop",
    "dispatches": [
      {
        "id": "blocking",
        "skill": "previs.blocking-director",
        "provider": "agent",
        "mode": "propose",
        "scope": { "kind": "beat", "id": "order_exchange" },
        "after": ["assets"],
        "outputs": [
          { "role": "blocking-patch", "mediaType": "shotdsl-patch", "requiresApproval": true }
        ]
      }
    ]
  }
}
```

技能目录位于 `src/shotdsl/skills.js`，是编译器、未来执行器和 UI 的共同事实源。

## 暂不纳入

| 能力 | 不纳入当前 ShotDSL 的原因 | 合理归属 |
|---|---|---|
| 小说解析、故事图谱、分集和剧本生成 | ShotDSL 是单场景预演语言，没有项目级叙事存储 | 上游项目 / screenplay 工具 |
| 角色图、场景图、360 / 3GS 生成 | 当前资产入口是本地 glTF / primitive，媒体任务运行时尚不存在 | 独立资产流水线，通过 manifest 接入 |
| TTS、音效、配乐 | 当前播放器没有音轨 IR | 后续 AudioDSL 或 timeline 扩展 |
| 图生视频、逐镜渲染、成片合成 | 当前交付物是浏览器实时 3D previs | 独立 render / export pipeline |
| 无限画布和团队任务中心 | 是产品工作台与任务基础设施，不是场景语言语义 | 外层应用 |

## 推荐实施顺序

1. 先把 `asset-supervisor` 和 `previs.qc` 做成纯函数报告，复用现有 diagnostics、Catalog 和 smoke 结果；
2. 增加结构化 `ShotDSLPatch`（base hash、operations、diagnostics、provenance），由 UI 展示 diff 后人工接受；
3. 接入 blocking / action / camera 三个 Agent，每个 Agent 只能写自己声明的属性集合；
4. 实现 workflow runner：按 DAG 调度，无依赖且只读的步骤可并行，proposal 接受后再解锁下游；
5. 最后补连续性分析器，包括 180° 轴线、视线匹配、动作接点、镜头覆盖和空间碰撞。

这一路线保留 ShotDSL 的核心原则：Agent 负责提出可审查的 DSL 变更，Compiler 与播放器仍是确定性的最终裁判。
