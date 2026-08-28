# Examples

示例按产品模块分开管理，源码目录结构会原样映射到构建产物的 `/examples/`。

```text
examples/
├── storyboard/       # 动态分镜 ShotDSL
└── character-image/  # 人物形象自由文本描述
```

## Storyboard

- 每个示例是一份 UTF-8 `.shotdsl` 文件；
- 文件名同时作为界面显示名；
- `山林 · 追踪与道具动作.shotdsl` 是默认示例；
- 构建时扫描目录并生成 `storyboard/manifest.json`。

## Character Image

- 每个示例是一份 UTF-8 `.txt` 人物描述，长度为 5-360 个字符；
- `manifest.json` 维护稳定的 ASCII ID、界面显示名、文件名和默认示例；
- ID 用于 `/character-image/?example=<id>`，重命名显示文案时不应修改 ID；
- 构建会校验 manifest、重复 ID、文件路径和描述长度，再同步到公开目录。
