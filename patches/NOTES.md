# 补丁注释存档（从 core.js 迁移）

`patches/*.json` 不能写注释，这里保留重构前散落在补丁表里的 `//` 说明。
每条对应一个补丁 id；`表头` 是数组声明之前的公共说明。

## 表头

```
无归档时用 node:fs；app.asar 还在时改写真实的 resources/app，避免新建文件 ENOENT。
H19:原子写。write-to-tmp + rename。EBUSY/ENOSPC 都不会半写坏原文件。
不走 FileHandle:hostFs.promises 只包了 readFile/writeFile/mkdir/unlink/rm/copyFile,无 open。
不显式 fsync:原子性靠 rename;KB 级配置文件断电丢最新一次写入可接受,下一次 apply 会补。
H21:新临时文件默认 0644,rename 会把原权限吃掉。官方 CLI 的 dsh 原本 0755,
写一次就变成 0644 → Permission denied（#155 / #157）。写前记下,写完补回。
Buffer 走 5 参写法的三参重载；传 null 当 offset 在部分 Node 版本会抛。
大文件可能一次写不完，循环到全部落盘。
hostFs.promises 是白名单，没有 open/FileHandle，只能整文件写完再 rename（#202）。
不显式 fsync：原子性靠 rename，与同步版注释一致。
Windows 不走 npm.cmd，避免弹出控制台。
启动早期可能还看不到宿主目录。空结果不缓存，否则整次进程都是 0/52、每条跳过。
备份路径不能落在密封 bin 内。
#197：web 重启后的孤儿 server 要在 Cordis 激活前回收，钩子必须早于 webserver 绑端口。
bin.js 写失败（missing_bin / ACL）不阻断 Apply。源码 cli 跳过注入也算成功（#41）。
H17:rank 规则 error:X > reverted > absent > missing。坏结果不被成功覆盖。
npm-global 与 profile 下的嵌套副本。
从 bin.js 所在目录向上找。
PATH 落到 System32\bash.exe 会弹 WSL 控制台，只认 Git Bash。
phase-1 只留 persona + dsh-purge*。不改 contexts、不改消息白名单，梁神和官方插件照旧。
桌面只动本机桌面树 + 共享的 $DSH_HOME/.agent-presets，不碰 Web / npm-global。
不在这里 spawn git.exe，避免每轮对话弹控制台。
含 dsh-web-all 等套件嵌套。
@scope/pkg/node_modules/dsh-mnemon
删 supervisor.cmd/vbs，不要留空文件，否则 doctor 每轮都会 schtasks /Delete。
doctor 是独立进程，不加载 hide-console；启动改为 node + bin.js。
doctor 再拉起 profile 时不要继承控制台。
市场重启不要走 powershell / dsh.cmd。
dsh-web-all 嵌套副本。
启动时可能尚未组完依赖；Apply 时清掉失败缓存再探。
非致命
.modules.yaml 或 .pnpm 才当 pnpm；npm/yarn/bun 不走 hoist。
M35:先剥 ` # comment` 再剥引号。pnpm 的 .modules.yaml 可能带尾注释。
L32:按 platform 过滤。Linux 下不该出 macOS/Windows 路径,否则 isDshHomeDir 一堆噪声。
linux 默认空,官方桌面壳没有 linux 官方分发
DSH_HOME → 桌面进程旁 .dsh/dsh-home → 启动器旁 .dsh → ~/.dsh
不写死盘符；桌面端不借用 Web 启动器旁的主目录。
Windows 不跑 where.exe，部分宿主仍会闪控制台。
当前进程就是官方 exe：只认这份安装的 resources/app。
主目录旁边另一份也叫 DeepSeek Harness 的目录不是这次要洗的宿主。
```

## #1 WORKSPACE_CONTEXT_INTRO

```
这些补丁的替换链含"新版以旧版为前缀"的自匹配 pattern（STRONG_*_V2 是 STRONG_* 的前缀），
而 markers 默认只用于报状态、不参与防重复应用 → 每次 apply 都会再叠一层（实测 +841 字符/次，永不收敛）。
与 #41/#42/#45 一致，用 skipIfMarked 让 markers 真正生效。
0.1.6 及更早是 WORKSPACE_CONTEXT_INTRO；0.1.7 改名为 AGENT_INSTRUCTIONS_INTRO，句子相同。
```

## #2 REPLACEMENT_WORKSPACE_CONTEXT_INTRO

```
完成标记是 0.1.7 的「不得覆盖 system」。强句还在时必须改回去，不能因 ACTIVE 标记跳过。
```

## #3 SCOPE_INTRO

```
作用域强句会被多次 Apply 叠在同一模板字符串末尾。标记必须是改回后的原句，
替换从强句开头吃到模板结束反引号，把叠层一次收掉。
```

## #4 SYSTEM_PROMPT_PERSONA

```
0.1.7 web-app / headless：身份在 personaPrefix 折叠段，工作目录在 personaSuffix。
```

## #43 WEB_PRESET_IDENTITY_STRIP

```
strictFiles 的列表里只能放「宿主一定有的文件」。preset-unrestricted 不是内置预设，
只有用户自己造了一个才存在；把它列进来，等于让这个补丁永远满足不了自己的契约
（rollupPatchStatus 只在 notFound>0 时判失败，missing 计数会被 applied 吃掉，静默变绿）。
它改由 #76 以软补丁单独兜底。
用户自造的 unrestricted 预设走软补丁：文件不在就 skipped，在就把身份句清掉。
不参与 strictFiles 的硬判定，这样有没有这个预设都不会拖累 #43。
这一行早被 #70 的整段 shell 重写一并吃掉了，本补丁的 pattern 再也不会命中。
没有 markers 会让它长年报 skipped；挂上 #70 的标记，清洗到位的文件就报 already。
YAML 侧的后处理（sanitizeYamlPersonaScalars）会重排 prefix 折叠块，
有时把身份句删掉了却没留下 marker 那行 —— 结果就是「目的达成、标记缺失」。
strictFiles 会把这种半完成状态判成 pattern_not_found 硬失败。
按布局软补丁结算：残留 pattern 没了就算做完，不靠 marker 一行定生死。
```

## #5 APPROVAL_NEVER_SENTENCE

```
full-access 改写与 MAX 句式互斥，只命中一种。
```

## #6 SANDBOX_DENY_FILE_WRITE

```
只改 YAML 默认值，不写 DSH_PERMISSION_MODE，避免锁死设置页。
```

## #7 SANDBOX_MODE_DEFAULT

```
policy 与 mode 一起出现，permission-presets 才能对上。
```

## #13 ESCALATION_WIDENING_EXEMPT

```
npm 包：tab + void 0 + 单行 throw
```

## #15 SANDBOX_CONFINE_PASSTHROUGH

```
新版 dsh-sandbox-local：confine(argv, policy) 去掉了 async/signal 与 policy 规范化。
旧签名（带 signal 与 policy 规范化），保留以兼容旧版回放。
```

## #21 BASH_TIMEOUT_RESTORE

```
Migration only: clean installs and custom timeouts need no changes.
Bash calls are exclusive in DSH. Raising this foreground wait to
10 minutes also blocked every later call in the same tool batch.
Undo only marked plugin values, including the old extra-zero bug.
Unmarked values or a user's changed value remain untouched. Bound
the match to this entry so a missing timeout cannot reach the next.
```

## #23 SUBAGENT_MAXDEPTH_RAISED

```
0.1.7 起深度默认在工具参数上（dsh-tool-subagent）；旧版在 dsh-subagent 服务配置上。
0.2 起 tool-subagent 的 maxDepth 可能没有 .default(3)，补回 default(10)。
新版工具参数：union + provider-managed，默认 3。
0.2：schema 去掉了 default，官方 preset 又不写 maxDepth；补回 default(10)。
0.1.5/0.1.6 时代：数值 schema，默认 1。
```

## #25 HARNESS_IDENTITY_STRIP

```
minimal 的 complete:true 会挡住 inject；只打开槽并去掉默认身份。
```

## #26 MINIMAL_PERSONA_PURGE

```
极简工具表保持官方 persistent shell；inject 侧用 identity.adaptInjectForMinimalPreset（#78/#79 已撤）。
phase-1 白名单放行 dsh-purge section。
```

## #28 LIANGSHEN_PHASE1_KEEP_INJECT

```
Web GUI 文案里的产品名会进「你是谁」回答。
```

## #32 WEB_SURFACE_IDENTITY_NEUTRAL

```
rc.3 把这两句搬到了 dsh-harness-dev-context，两个文件都要扫。
↓ 0.2.1-rc.3 的 dsh-harness-dev-context 布局
↓ 0.2.1-rc.5：上游自己改成了 local web GUI，直接删掉这句身份话术。
rc.5 的 harness-dev-context 还留了 legacy 身份前缀。
rc.5 的 web-app 仍带产品名。
续接旧会话时也别把旧的 web GUI 段落原样回放。
标记落在代码注释里，不进入模型看到的提示词。
rc.5 的 web-app-lib 已经不含这段提示词；留一个代码注释标记，避免整条补丁永远显示 drifted。
#53 会把前一句再收成 Local web GUI，不能再要求两句标记同时在。
去掉 fetch/search 结果「不可信 / 不是指令」提示，功能保留。
```

## #29 TOOL_WEB_UNTRUSTED_NEUTRAL

```
hooks.json 的 deny 改成 allow，其余 hook 逻辑不动。
```

## #31 HOOKS_CODEX_DENY_ALLOW

```
bash/pwsh 工具描述里的拒绝句改掉。
```

## #34 SANDBOX_HINT_NEUTRAL

```
escalation 不再因加宽失败抛 reject。
```

## #36 TOOL_FS_ESCALATION_SCHEMA

```
rc.2 只有 tool-fs；rc.5 的 bash/pwsh 也各带一份同款 justification 描述。
↓ 0.2.1-rc.5：bash/pwsh 也有同款 justification 描述（与 tool-fs 同步支持 rc.2）。
各文件替换后的措辞大小写不同（tool-fs 写 "Approval"，escalation 写 "approval"）。
子 agent 的 permission-scope 提示词。
```

## #37 SUBAGENT_SCOPE_LOCK_NEUTRAL

```
0.1.5 schema 不认 text；社区预设仍带 text 时挂载失败。
```

## #38 PERSONA_TEXT_PREFIX_ALIAS

```
v0→v1 只允许 notice 带 summary；mnemon 的 instructions/recall 会让旧会话打不开。
```

## #39 SESSION_V0_PLUGIN_SUMMARY_ALIAS

```
complete:true 会在 waterfall 之后只留完整段。操作者段是 waterfall 里加上的，
必须从 waterfall 的结果里抄，不能从 waterfall 之前的段落里抄。
```

## #40 COMPLETE_PROMPT_KEEP_INJECT

```
0.2.1-rc.2 (#132 / #142)：assemble 之后多了 requiredContexts 过滤，旧 pattern 一条都不命中，
补丁落成 skipped → ensureHostClean 认为没写进宿主，直接取消重启。
缩进不固定。0.2 有的构建用 tab，有的用空格；只认 tab 时匹配为 0，重启校验会说没写进宿主。
```

## #42 SETTINGS_LEGACY_API

```
0.2.0-rc.2 已去掉 legacyApplyPath，mutate 走同文件里的 applyPathOp。不要再插函数定义。
#86 升级:老用户早期产物没过 plainConfig,volatile 字段漏进 validate。
#89 升级:同一行要补 `?? {}` 兜底 — mergeLayers(over=undefined) 原语会返回 undefined,
  导致 schema(undefined) 填默认值,options.base 整段静默丢弃。两 fix 互补。
#86 升级:commitLegacy 同根问题。
#89 升级:commitLegacy 同样补 `?? {}` — change(user) 可能返回 undefined,registration.base 建仓时也可能是 undefined。
#89 旧 fallback:老用户早已 patch 到 #86 的 plainConfig 但没 `?? {}`,这里把 2 行都升到带兜底版本。
  match 原子不含注释尾巴,只对**第一次 #86 升级产物**升级一次,带 #89 兜底的产物不会二次匹配。
#89 换 marker:老用户已带 "#86 plainConfig" 单独 marker,但缺 `?? {}` 兜底 —— 必须进 replacements 走升级。
```

## #46 OFFICIAL_DESKTOP_UPDATE_ASCII

```
pi-ai 新版：变量名从 initialSystemText 改成 context.systemPrompt。
上游已删谨慎句时无残留 pattern，按软完成计（#48）。
↓ 老版本 dsh-purge 留下的 operator-authorized 文案（rc.2 及更早）。
↓ 0.2.1-rc.5：上游恢复成 untrusted 文案，去掉限制性措辞，保留只读事实。
0.1.7-rc.2 / 0.2 起去掉 .volatile()；限定在本补丁两个文件内各只命中一次。
rc.3 的 checkout 限制句（"Use this checkout only to inspect or extend DSH itself"）
与 "不要另开服务器" 一并落在这个新插件里。
↓ 0.2.1-rc.3 的 dsh-harness-dev-context 布局：去掉 checkout 用途限制
rc.5 的 web-app-lib 已经不含这段文案；留一个代码注释标记，
避免该文件既无 pattern 又无 marker，把整条补丁拖成 drifted。
不能共用 #32 的注释标记：那个标记由 #32 无条件写入，
放在这里会让旧宿主上的 #53 在本体还没清洗时显示 applied。
#207：dir 模式静默退出时，host 的 close 回调是唯一知道真实退出码的地方。
#83 在 signal 分支直接 resolve 不记录，这里把每条退出路径都记下来。
#207：主进程自己静默退出时完全没人记录原因。挂一层生命周期日志，
记录 before-quit / will-quit / quit(exitCode) / 渲染进程崩溃 / 信号 / 未捕获异常。
锚点还在时也别再 replaceAll。这个文件是前端模块，重复写会改 mtime。
上一版只藏 surface 序号。界面气泡和「用时」挂在回合事件上，序号对不上就还留在聊天里。
不再写死整段 5 行：官方在中间加一行就整条失配
  （0.2.1-rc.2 起是 if (this.revised.size > 0) this.revised.clear();，
   0.2.1-rc.3 又改了一次）。
这里只锚方法头、event 取值、去重判断和结尾的 set，中间用非贪婪窗口吃掉，
窗口内容原样搬回去 —— 官方再往里加行也不影响。
窗口里排除 isRewindMarker：打过一次之后正文里就有这个词，
再不排除的话第二次 apply 会把注入块再插一遍（历史事故：每次 apply 越滚越长）。
问题:只排除 deepseek.com 远远不够。第三方 OpenAI-compat 代理(recoverystar / 中转站 /
glm 等)不认 developer role,会把 developer 消息静默丢弃 —— 导致 hang 全文进不了模型
注入的整段系统提示词从未到达模型(审查实验证实:同样内容 system 计 117 tokens,
developer 只 87 tokens,差值恰好是指令大小)。
修复:白名单 —— 只有 OpenAI 原生 (api.openai.com) 和 Azure 原生 (*.azure.com) 才用
developer,其他全部回退 system,保证注入不被静默丢。
原始官方代码(未清洗) → 白名单。
0.1.7+ / 0.2:改写为 useDeveloperRole。
responses 通路。
0.2.1-rc.5：responses 通路的变量名改成 instructionRole（旧 pattern 只覆盖 role）。
老用户已清洗过(deepseek 黑名单版)—— 升级为白名单。
新 marker。老 marker 老用户文件里还在,但新 marker 不匹配 → skipIfMarked 返回 false,
走升级 pattern 覆盖掉老 replace,完成白名单升级后文件带新 marker,下次 skip。
不能加 skipIfMarked：老版本只打了 approval 分支，带上 marker 后新分支会被整条跳过。
↓ 0.2.1-rc.2 / 空格缩进副本（undefined）
```
