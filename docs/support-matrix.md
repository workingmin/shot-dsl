# ShotDSL 支持矩阵

## 产品能力

| 能力 | 状态 | 说明 |
|---|---:|---|
| 结构化分镜输入 | 完整 | ShotDSL 表达 scene、entity、beat、track 和 event；不记录每帧 |
| 确定性时间轴 | 完整 | 支持任意 seek、linear/smoothstep/hold、quaternion slerp |
| 镜头调度 | 完整 | fixed、lookAt、follow、orbit 和 camera cut |
| 人物走位 | 完整 | position/rotation/scale/visibility 关键帧 |
| 基础骨骼动作 | 完整 | 统一代理人、绝对时间采样和 crossfade |
| 注视 | 完整 | point/entity/bone 目标，按时间范围生效 |
| 道具附着 | 完整 | object 绑定人物语义骨骼，支持 offset 和 release |
| 接触 IK | 原型 | CCD 校正手部接触；尚无关节限制和脚底稳定 |
| 分镜文字标注 | 完整 | note 事件在指定时间段显示并进入时间轴 |
| 黑白线条渲染 | 原型 | 浅色实体、OutlineEffect、几何折线、阴影和网格 |
| PNG 导出 | 完整 | 导出当前时间点画面 |
| WebM 导出 | 原型 | 浏览器实时逐帧推进；尚非离线 WebCodecs 管线 |

## Character Image

| 能力 | 状态 | 说明 |
|---|---:|---|
| PBR 静态人物查看 | 完整 | 保留 GLB 原始肤色、服装颜色及 PBR 贴图 |
| 固定人物视图 | 完整 | 自由、正面、侧面和背面 |
| 三视图 PNG | 完整 | 固定正交相机输出正面、侧面、背面横向合成图 |
| 自由文本生成 | 原型 | Meshy preview/refine；需要服务端 `MESHY_API_KEY`，可能产生费用 |
| 生成任务持久化 | 原型 | 元数据和 GLB 保存在 `.shotdsl-data/`，未实现用户级权限和清理策略 |
| 人体资产门禁 | 未实现 | 当前只检查 80 MB 大小限制和 GLB 魔数，尚未检查骨架、站姿、人体完整性和许可 |
| 写实内置资产 | 未实现 | 当前 CC0 mannequin 只用于离线查看器和导出验证 |

## 动作

| 语义 | storyboard-mannequin |
|---|---|
| idle | 原生 Idle_A |
| walk | 原生 Walk |
| run | 原生 Sprint |
| crouch | 原生 Crouch_Idle |
| fall | 原生 Death_D |
| talk | Idle_A + 程序化头部和手臂叠加 |
| reach | Idle_A + 程序化右臂触物动作 |
| look-around | Idle_A + 程序化头部叠加 |

未知动作和模型能力缺失会产生编译错误，不允许静默回退为 idle。

## 渲染

唯一规范 style 为 `storyboard`。`rough-ink` 和 `rough_ink` 作为迁移别名解析为 `storyboard` 并产生 warning。cinematic、cinematic-outline 和 wireframe 已移除。

## 暂不支持

- 写实人物、服装、选角和面部表情；
- PBR 材质、环境反射、环境 preset；
- 武器、粒子和战斗专用动作/机位；
- 刚体、布料和完整物理仿真；
- 音频、对白口型和 MP4；
- 专业 Agent workflow；
- 自动 3D 建模和多人实时协作。
