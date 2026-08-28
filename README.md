# Shot DSL

面向基础分镜设计的黑白线条 3D 动态分镜工具。它把传统纸质分镜中依靠箭头和文字表达的镜头运动、人物与物体走位、空间关系和时间节奏，转换为可播放、可拖拽、可导出的视频预演。

## 产品目标

> 将静态纸质黑白分镜升级为可回放、可调整、可导出的黑白线条 3D 动态分镜预演。

产品服务于“基础分镜设计 → 传统手绘分镜”工序，不追求拟真人物、复杂表演、物理仿真或最终画面质量。判断结果好坏的标准是：

- 镜头位置、焦段、运动和切换是否明确；
- 人物与道具的走位、朝向、遮挡和空间关系是否可读；
- 动作开始、停顿、交接和剪辑节奏是否合理；
- 相同时间点能否稳定还原相同场景状态；
- 黑白线条画面能否稳定回放并导出。

“黑白线条 3D”不是显示模型三角网格。默认画面使用浅色实体、黑色外轮廓、必要结构线、接触阴影和地面参照线，以接近传统分镜的阅读方式。

## 当前能力

- ShotDSL v0.1 Parser、语义校验、带行号诊断和 Scene IR；
- beat 级分镜意图，以及可在画面中显示的时间段文字标注；
- actor、primitive object、camera、light 和代理场景；
- 绝对时间轴、linear/smoothstep/hold、quaternion slerp 和 camera cut；
- fixed、lookAt、follow、orbit 四类通用机位；
- 统一中性代理人、基础动作 Clip、动作混合和多人独立骨架；
- 人物注视、道具骨骼附着和接触 IK；
- 单一 storyboard 黑白轮廓渲染管线；
- 播放、暂停、回到开头、任意拖拽和 PNG 当前帧导出；
- 浏览器 WebM 视频导出。

实验性的 `/character-image/` 人物模块当前提供：

- 保留 GLB 原始肤色、服装颜色和 PBR 贴图的静态人物查看器；
- 5 组可直接载入的人物形象描述示例，以及 `?example=<id>` 示例深链接；
- 自由、正面、侧面和背面视图；
- 正面、侧面、背面合成三视图 PNG 导出；
- 通过服务端 Meshy Text to 3D preview/refine 任务从自由文本生成人物；
- 生成任务和 GLB 资产在 `.shotdsl-data/` 中持久化，浏览器不接触 Provider API key。

当前内置人物只是用于离线验证查看器和导出的 CC0 代理资产。写实人物生成需要配置 Meshy，生成质量和费用由供应商服务决定；当前仅校验 GLB 格式和大小，尚未完成自动人体骨架、静态站姿和资产许可门禁。

输入层记录分镜设计，不记录每帧数据。作者描述镜头、实体、beat、关键状态和事件；编译器生成关键帧轨道与离散事件组成的 Scene IR；播放器在播放或导出时按目标帧率求值。

## 架构

```text
ShotDSL / 未来的可视化编辑器
              ↓
Parser + Semantic Compiler
              ↓
Scene IR：实体 + beat + track + event
              ↓
确定性 Timeline Engine
              ↓
Three.js 代理场景、骨骼动作、IK、相机
              ↓
黑白实体 + 轮廓
              ↓
交互回放 / PNG / WebM
```

Scene IR 是内部结构化运行时契约，当前使用 JavaScript 对象表示。产品输入不要求 JSON，也不要求细化到帧。

## 本地运行

需要 Node.js 22 或更高版本：

```bash
npm install
npm run dev
```

浏览器入口：

```text
http://127.0.0.1:4173/storyboard/
http://127.0.0.1:4173/character-image/
```

如需启用自由文本人物生成，在项目根目录创建 `.env` 并设置：

```dotenv
MESHY_API_KEY=your_server_side_key
```

未配置密钥时，人物模块不会发起生成请求，仍可查看示例人物并导出三视图。Meshy 任务可能产生费用，密钥只能配置在服务端环境变量中。

根路径 `/` 会自动重定向到动态分镜编辑器。

```bash
npm run check
npm run smoke
npm run smoke:character
```

`npm run check` 执行资产审计、单元测试和生产构建；`npm run smoke` 和 `npm run smoke:character` 需要先运行本地服务，分别验证动态分镜与人物模块。

## 视频导出说明

当前使用浏览器 `MediaRecorder` 导出 WebM，并按场景 fps 逐帧推进确定性时间轴。导出期间需要按成片时长实时录制。后续若需要更快的离线导出、MP4、音频同步或精确码控，应引入 WebCodecs + muxer 或服务端 FFmpeg。

## 动态分镜明确不做

- 把 character-image 的写实人物直接带入动态分镜；
- 动态分镜中的电影级 PBR 材质、环境反射和复杂灯光；
- 战斗特写、粒子、武器和表情系统；
- 完整刚体、布料和人体动力学；
- 把未经人体和许可门禁的生成资产作为可动画角色；
- 专业 Agent 调度工作流；
- 非线性剪辑和多人实时协作。

## 文档

- [技术可行性与实施路线](docs/feasibility.md)
- [ShotDSL v0.1](docs/shotdsl-v0.1.md)
- [当前支持矩阵](docs/support-matrix.md)
- [人物 3D 展示模型层设计](docs/character-image-model-design.md)
