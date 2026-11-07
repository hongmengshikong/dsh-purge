# hosts/ — 宿主钉版本

这个插件按 **1 宿主版本 : 1 插件版本** 发布，不做多版本通用。

- `hosts/<宿主版本>/` 是该宿主被补丁命中的全部文件快照（结构与真实安装同构）
- `hosts/index.json` 是双向索引：宿主版本 → 插件版本 / `dshTarget`，反过来查也够用

## 目录结构

```
hosts/
  0.2.2-rc.1/
    manifest.json                    # 版本、41 个包各自版本、57 个文件的 sha256
    node_modules/@deepseek-ai/...     # 与真实安装同构，可直接当 aiBase 用
    node_modules/@earendil-works/pi-ai/dist/api/...
  index.json
```

`patchStatus(hosts/<ver>/node_modules/@deepseek-ai)` 不需要改引擎——路径布局与线上一致，
所以门禁跑的就是“真宿主”。

## 两个方向的对应

```jsonc
// hosts/index.json
{
  "0.2.2-rc.1": {
    "manifest": "hosts/0.2.2-rc.1/manifest.json",
    "pluginVersion": "1.1.92",
    "dshTarget": "0.2.2-rc.1",
    "files": 57,
    "bytes": 2848498
  }
}
```

- 正查：宿主 `0.2.2-rc.1` → 插件 `1.1.92`
- 反查：插件 `1.1.92` → `dshTarget: 0.2.2-rc.1`

## 门禁口径（快照是未打补丁的原始宿主）

`pending` 表示「pattern 命中、可以打」，不是失败——新快照天然都是 pending。

`npm run host:verify`：

| 类别 | 要求 |
| --- | --- |
| 必需补丁（`optional !== true`） | 必须**可打**：`applied`（已打）或 `pending`（pattern 命中、待打）都算通过；`drifted`/`unmatched`/`missing_file` 才算失败 |
| 可选补丁（`optional === true`） | 不可打只记录，不挡发版 |
| 文件在本宿主不存在（如未安装的 hooks/liangshen 插件） | 不计入 gate，单独列出 |
| 宿主指纹 | 本机 57 个文件的 sha256 与 manifest 比对；不一致 = 宿主已升版 |

同时会比对**本机安装**与**钉子**：`本机宿主 : 0.2.2-rc.1 = 钉子` 才说明用户在支持的版本上；
显示 `≠ 钉子（已升版）` 时，说明该发新插件版本了，而不是让旧插件半应用。

## 宿主升版流程

```powershell
# 1. 换到新宿主后，重新抓快照（会写入 hosts/<新版本>/ 并更新 index.json）
npm run host:snapshot

# 2. 改 package.json 的 dshTarget 指向新版本
# 3. 跑门禁，拿 drift 清单
npm run host:verify

# 4. 逐条修 patches/*.json（一条补丁一个文件、一个 commit）
# 5. 门禁转 PASS 后发版，插件版本 +1，hosts/index.json 里的 pluginVersion 随之更新
```

## 注意

- `hosts/` 不进 npm 包（`package.json` 的 `files` 未包含），只是仓库内的发布门禁与回归基线。
- 快照里的文件是上游产物，仅用于本地判定；署名与许可见仓库根 `NOTICE` / `LICENSE-COMMERCIAL.md`。
- 快照会随宿主升级持续增长（每版约 2.7 MB）。只想保留最近两版时，删旧目录并同步 `index.json`。



