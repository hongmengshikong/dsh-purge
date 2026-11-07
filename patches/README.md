# patches/ — 补丁表数据

补丁数据全部在这里（JSON），`lib/core.js` 只保留引擎（定位文件、应用、状态、回滚）。
按层分成四个文件，**数组顺序 = 应用顺序**，不要重排：

| 文件 | 对应代码常量 | 条数 | 内容 |
| --- | --- | --- | --- |
| `prompt.json` | `PATCHES` | 10 | 系统提示 / 身份 / 审批话术 |
| `code.json` | `CODE_PATCHES` | 3 | 宿主分包实现细节 |
| `engine.json` | `ENGINE_PATCHES` | 8 | 审批、沙箱、权限默认值 |
| `tools.json` | `NEW_TOOL_PATCHES` | 62 | bash/pwsh/fs/web 等工具描述与行为 |

- `display-groups.json`：状态页把升级链合并为一行展示的分组（原 `PATCH_DISPLAY_GROUPS`）。
- `patch.schema.json`：结构约束，`lib/patch-loader.js` 载入时校验（零依赖子集校验器 `lib/patch-schema.js`）。
- `patches/legacy/`：旧宿主兼容补丁（#40 0.1.5、#47/#49 0.2.0）只留档、不参与加载与门禁。
- NOTES.md：从 `core.js` 迁移出来的原 `//` 注释（含各 rc 版本的漂移情报）。JSON 不能写注释，改动补丁时**同步更新这里**。

## 字段速查

| 字段 | 含义 |
| --- | --- |
| `id` / `name` | 稳定标识；`name` 与状态页/日志对应 |
| `file` | 宿主文件键（`targetFiles()` 的 key），可写单个字符串或数组 |
| `rel` | 相对宿主包内的路径片段 |
| `replacements[]` | `{ pattern, replace, expect?, insertProbe? }`，按顺序执行 |
| `patterns[]` / `replace` | 旧式单条替换（仍被引擎支持） |
| `markers[]` / `marker` | 已应用标记，用于跳过重复应用与状态判定 |
| `skipIfMarked` | 命中 marker 即跳过（防自匹配叠加） |
| `optional` / `strictFiles` | 未命中是否算软成功 / 是否严格要求文件存在 |
| `surfaces` | 限定 web / desktop |

`pattern` 可以是字符串（精确匹配），也可以是正则：

```json
{ "pattern": { "regex": "These instructions are ACTIVE", "flags": "g" }, "replace": "..." }
```

存 JSON 时 RegExp 会丢成 `{}`，所以统一编码成 `{regex,flags}`，载入时由 `lib/patch-codec.js` 还原成 `RegExp`
（引擎用 `pattern instanceof RegExp` 判定）。**手写补丁时不要直接写 `{}`。**

## 工作流

```powershell
# 1. 抓当前宿主 + 补丁表快照（只读）
npm run snapshot:status

# 2. 改动补丁后验收：数据等价 + 正则还原 + 状态与基线逐 id 相同
npm run verify:patches

# 3. 从旧版 core.js 重新导出（仅重构期需要）
npm run patches:dump
npm run patches:split

# 4. 重新生成随包提示词封存表（提示词改动后）
npm run embed-prompt
```

## 加一条补丁

1. 在对应层的 JSON 末尾追加条目（`id` 不得重复，`lib/patch-loader.js` 会查重）。
2. `name` 用大写字母/数字/下划线；`desc` 一句话说明"改了什么"。
3. 在 `NOTES.md` 里补一条该版本宿主原文的差异说明（下一次漂移时最有用的就是它）。
4. `npm run verify:patches`：会打印 schema 错误的具体路径，例如 `$.patches[3].replacements[0].pattern: type 期望 string|object，实际 number`。



