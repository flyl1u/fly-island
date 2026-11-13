# 对外契约清单

纯重构中下列标识不得改变，规则见根目录 [AGENTS.md](../../AGENTS.md#对外契约不得随意变更)。新增契约时同步更新本节。

## localStorage key

| key | 当前定义位置 |
|---|---|
| `focusd-island-settings` | `features/appearance/storage.ts` |
| `focusd-island-collapsed-text-default-v1`（迁移标记） | `features/appearance/storage.ts` |
| `focusd-island-setting-presets`（2026-11-09 起不再读写：样式预设已去掉，旧数据留着不动） | — |
| `focusd-island-todos` | `features/todos/storage.ts` |
| `focusd-island-active-todo` | `features/todos/storage.ts` |
| `focusd-island-todo-timer`（单轮待办倒计时：`{ todoId, endsAt, durationMinutes, notified }`，`endsAt` 为 Unix 毫秒时间；`notified` 在首次到时提醒前写为 true，旧记录缺此字段按 false；结束、完成、删除或切换待办时清除） | `features/todos/storage.ts` |
| `focusd-island-todo-durations`（各项待办的时长 `{ [todoId]: 1–240 的整数分钟 }`，没有记录或无效按 15 分钟，写入时去掉已删除待办；2026-11-12 起取代所有待办共用的 `focusd-island-todo-duration`，旧 key 不再读取也不删除） | `features/todos/storage.ts` |
| `focusd-island-current-date` | `features/todos/storage.ts` |
| `focusd-island-archives` | `features/todos/storage.ts` |
| `focusd-island-scheduled-todos`（安排在以后日期的待办，`{ id, title, date, createdAt }[]`） | `features/todos/storage.ts` |
| `focusd-island-daily-note` | `features/todos/storage.ts` |
| `focusd-island-save-directory` | `features/todos/storage.ts` |
| `focusd-island-last-saved-signature` | `features/todos/storage.ts` |
| `focusd-island-position` | `windows/island/storage.ts` |
| `focusd-island-music-sources` | `features/media/storage.ts` |
| `focusd-island-media-diagnostics-dismissed`（字符串数组，每项为小写 sourceAppId + `\u001f` + 非 ok 的 status；损坏或旧格式回退空数组） | `features/media/storage.ts` |
| `focusd-island-settings-focus`（主窗口 → 设置窗口的跳转请求） | `windows/settings/storage.ts` |
| `focusd-island-detached-settings`（`"true"` / `"false"`：设置在独立窗口打开；2026-11-10 起没有或无效时默认独立窗口，已保存的 `"false"` 仍为岛上内嵌，不进外观预设） | `windows/settings/storage.ts` |
| `focusd-island-position-reset`（设置窗口 → 主窗口：让岛回到主屏顶部居中，`{ requestedAt }`，超过 5 秒的请求忽略） | `windows/settings/storage.ts` |
| `focusd-island-panel-preview`（设置窗口 → 主窗口：拖动尺寸滑块时让岛展开或收起预览，`{ mode, requestedAt }`，超过 2 秒的请求忽略） | `windows/settings/storage.ts` |
| `focusd-island-qq-mail-settings` | `features/messages/mail/storage.ts`（`{ accounts: [{ email, host, enabled }] }`，兼容读取旧的单账户 `{ email, enabled }`，解析在 `mailAccounts.ts`） |
| `focusd-island-qq-mail-remote-images`（2026-11-11 起不再读写：邮件里的远程图片总是加载，已存的值留在原处不删） | 无 |
| `focusd-island-qq-notifications-enabled` | `features/messages/qq-notifications/storage.ts` |
| `focusd-island-qq-notification-access-requested` | `features/messages/qq-notifications/storage.ts` |
| `focusd-island-wechat-reminders-enabled` | `features/messages/wechat/storage.ts` |
| `focusd-island-wechat-message-preview-enabled`（字符串 `"true"` 开启，缺失或其他值关闭） | `features/messages/wechat/storage.ts` |
| `focusd-island-wechat-hide-minimized-taskbar`（字符串 `"true"` 开启，缺失或其他值关闭） | `features/messages/wechat/storage.ts` |
| `focusd-island-translation-settings` | `features/translation/storage.ts` |
| `focusd-island-agent-approval`（`{ onIsland, whenInFront }`：Agent 的权限请求在岛上审批，默认关；`whenInFront` 为会话窗口在前台时也弹卡片，2026-11-09 起不再是设置项，读取时总按默认（关）；开着时岛屿让审批端点挂起请求） | `features/agent-status/approvals/storage.ts` |
| `focusd-island-agent-hidden-sessions`（`{ "<provider>:<sessionId>": updatedAt }`：在 Agent 页手动移除的会话，只隐藏不删记录；值是移除时那一轮的开始时间（以前存的是最后写入时间），开始新一轮才自动回来，最多 200 条） | `features/agent-status/hiddenSessions.ts` |
| `focusd-island-agent-seen-turns`（`{ "<provider>:<sessionId>": 轮次 }`：在 Agent 页看过的会话，轮次是这一轮的开始时间，卡在半路时是最后写入时间；重启岛屿后看过的不再提醒，最多 300 条） | `features/agent-status/unseen.ts` |
| `focusd-island-agent-session-filters`（2026-11-09 起不再读写：隐藏会话规则已去掉，旧规则不再生效；格式曾为 `[{ kind: "folder" | "prompt", value }]`） | — |
| 外观主题文件（2026-11-08 起；`fly-island-theme-<日期时间>.json`，写到「下载」文件夹，命令 `save_theme_file`，Rust 端按文件名前缀和内容放行；`{ app: "fly-island", kind: "theme", version: 1, name, exportedAt, appearance }`，`appearance` 只含 `features/appearance/settings.ts` 的 `APPEARANCE_SETTING_KEYS`；导入时只读这些字段，叠在当前设置上经 `normalizeSettings` 校验后存成一个新的样式预设，不自动应用） | `features/appearance/theme.ts` |
| `focusd-island-locale` | `i18n/index.ts` |
| `focusd-island-update-channel`（`"stable"` / `"beta"`；3.0.2 及更早的设置写入，现已不读，一律按稳定版检查） | — |

## 媒体诊断命令

新增命令 `get_media_diagnostics()` 返回 `{ players }`：逐会话的 `sourceAppId`、`label`、`hasSession`、`hasTimeline`、`hasPluginTrackId`、`exePath`、`directory`、`version`、`status` 与 `neteasePluginState`（非网易云为 null），并补入正在运行但没有会话的已知播放器。只读检查，不安装插件。`get_media_state` 新增 `hasTimeline` 布尔字段；前端兼容缺少字段的旧状态，估算位置始终保留 false 标记。

## 事件

| 事件名 | 发送方 | 目标 |
|---|---|---|
| `island-position-changed` | `island/mod.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-position-cleared`（无载荷：岛屿跟随鼠标或前台窗口换了显示器，拖动保存的位置作废，主窗口清掉 `focusd-island-position`） | `island/follow.rs` | 主窗口 |
| `island-top-attachment-changed`（载荷为 `bool`：岛屿是否贴住所在显示器顶边） | `island/top_edge.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-hover-changed`（载荷为 `bool`：光标是否在岛屿形状内，供悬停展开使用） | `island/passthrough.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-cursor-moved`（载荷 `{ x, y }`：光标在主窗口 CSS 像素中的位置，窗口外也有；只在 `set_island_cursor_tracking(true)` 后、光标移动时发，约 28 次/秒，供中心图案的眼睛跟随） | `island/passthrough.rs` | 广播（通过主窗口对象调用 `emit`） |
| `foreground-fullscreen-changed`（载荷为 `{ active, onIslandMonitor }`：前台是否有全屏程序、是否占住岛所在的显示器，供游戏模式使用） | `system/fullscreen.rs` | 广播 |
| `media-session-changed`（无载荷：某个媒体会话的时间线、播放状态或歌曲变了，或会话增减；主窗口收到后立即重读 `get_media_state`。2026-11-11 起） | `media_control/watcher.rs` | 广播 |
| `clipboard-history-changed` | `clipboard_history/service.rs`（常量在 `mod.rs`） | 广播 |
| `clipboard-history-shortcut` | `clipboard_history/service.rs`（常量在 `hotkey.rs`） | 广播 |
| `clipboard-history-shortcut-status`（载荷为字符串或 `null`：剪贴板快捷键注册失败的原因，成功或关闭时为 `null`；最近一次结果也可用 `get_clipboard_shortcut_error` 读取） | `clipboard_history/hotkey.rs` | 广播 |
| `qq-mail-changed` | `mail/service.rs`（常量在 `mod.rs`） | 广播 |
| `qq-notifications-changed` | `qq_notifications/mod.rs` | `main`、`settings` |
| `wechat-reminder-changed` | `wechat_reminders/mod.rs` | `main`、`settings` |
| `translation-window-opened` | `translation/mod.rs` | 广播 |
| `translation-island-shortcut`（翻译设为「岛内页面」时按下翻译快捷键：先唤出主窗口，再让它切换翻译页） | `translation/mod.rs` | 广播 |
| `settings-open-requested`（无载荷：托盘、翻译窗口或独立设置窗口要打开设置，主窗口按 `focusd-island-detached-settings` 决定打开岛上的设置页还是独立窗口） | `settings_window/mod.rs`、前端 `windows/settings/api.ts` | `main` |
| `focusd-update-state` / `focusd-update-request`（更新状态由主窗口广播；独立设置窗口用后者请求 `snapshot` / `check` / `install` / `dismiss`；3.0.2 及更早还有 `channel`） | `features/updater/updaterController.ts` | 广播 / `main` |
| `agent-approval-requested`（载荷 `{ id, agent, kind, sessionId, cwd, toolName, toolInput, permissionSuggestions, receivedAt }`：一个会话等你在岛上审批的工具调用（`kind: "permission"`），或要你回答的 AskUserQuestion（`kind: "question"`，`toolInput.questions`），同一会话同时只发一条） | `agent_approval/mod.rs` | 广播 |
| `agent-approval-closed`（载荷 `{ id, reason }`，`reason` 为 `decided` / `timeout` / `disconnected` / `handedBack` / `shutdown`） | `agent_approval/mod.rs` | 广播 |

## 其他

- DSH（issue #51）：新增只读命令 `get_dsh_usage()`，返回 `null` 或 `{ updatedAt, available, wallets: [{ currency, total, granted, toppedUp }], source: "dshApi" | "dshAccount" }`，金额为十进制字符串。`list_agent_sessions` 的 `provider` 新增 `dsh`；`focus_agent_window`、`agent_sessions_in_front` 接受 `dsh`，既有参数和返回结构不变。无新增事件，无新增 localStorage key；`focusd-island-settings` 兼容新增 `agentShowDsh`（缺失时为 true）。`agent-status.json`、钩子安装状态仍只含 Claude/Codex。该命令是自有 Rust 命令，不增加 Tauri 插件/核心权限；现有 capabilities 足够。

- 展开岛屿的按钮样式保存在 `focusd-island-settings.pageButtonStyle`，支持 `capsule` 和 `icon`，缺失或未知值使用 `capsule`。
- 微信摘要通过 `set_wechat_message_preview_enabled(enabled)` 开关。`set_wechat_minimized_taskbar_hidden(hidden)` 设置最小化时隐藏微信任务栏图标。`set_wechat_reminders_enabled` 可接收 `previewEnabled` 和 `hideMinimizedTaskbar`，省略时保留对应偏好。事件快照包含 `previewEnabled`、`previewStatus`、`hideMinimizedTaskbar`、`messages`，消息行是 `{ id, receivedAt, contact, body }`。
- `open_wechat_conversation(messageId)` 用内存中的摘要 ID 定位微信会话。返回 `true` 表示已点击对应会话，`false` 表示已打开微信主窗口。微信的会话标识和进程身份保存在原生内存中。
- 应用数据目录的 `wechat-accessibility.json` 记录 `{ pid, started_at }`，用于重新校验进程并恢复岛屿临时开启的微信辅助功能标志。

- 窗口 label：`main`、`translation`、`settings`；前端分发参数为 `?window=translation`、`?window=settings`。
- Tauri 命令：以 `lib.rs` 中 `generate_handler!` 列表为准，命令名即 Rust 函数名。
- 应用标识 `com.focusd.island`，凭据服务名 `com.focusd.island.qq-mail`、`com.focusd.island.translation`。
- 注册表值：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 下的 `FocuSD Island`。
- Hook 受管区块标记：`# BEGIN/END FocuSD Agent Status Hooks`，命令签名前缀 `focusd-agent-`。
- 更新端点与 `latest.json` 格式：见 `tauri.conf.json` 和 `docs/updater.md`。
- 在岛上审批（2026-11-06 起）：端点路径 `POST /claude/permission-request`、`POST /codex/permission-request`，以及 Claude Code `PreToolUse` 钩子的 `POST /claude/ask-user-question`（只接 AskUserQuestion，回答以 `updatedInput.answers` 返回），以及 Claude Code 动静钩子的 `POST /claude/activity`（2026-11-07 起；请求体是 `PostToolUse` / `PostToolUseFailure` / `PermissionDenied` / `Stop` / `SubagentStop` / `UserPromptSubmit` 的钩子输入，总是回 `{}`，用来撤掉已在终端答过的卡片，事件 `agent-approval-closed` 的 `reason` 为 `answeredElsewhere`）（`Authorization: Bearer <令牌>`，`Host` 须为本机端口，带 `Origin` 的请求拒绝），返回 Claude Code `PermissionRequest` 钩子的格式，空对象 `{}` 表示交还终端；`agent-approval.json` 字段 `port`、`token`；Tauri 命令 `set_agent_approval_enabled`、`agent_approval_decide`（`decision` 为 `allow` / `deny` / `allowAlways` / `terminal`；提问为 `answer` 加 `answers`（问题原文 → 回答）或 `terminal`）、`agent_approval_pending`；事件见上表。
- 歌词缓存（2026-11-06 起）：应用数据目录下的 `lyrics-cache/<FNV-1a 哈希>.json`（`{ key, lrc, source?, translation?, wordTimes?, durationMs?, durations?, fetchedAt }`；`lrc` 可带增强 LRC 的逐字时间 `<mm:ss.xx>`（酷狗 KRC 转来）；`wordTimes` 为 true 的条目由保留逐字时间的版本写入，没有它的酷狗旧条目会重新下载；`durations` 为 true 的条目由记录歌曲时长的版本写入（`durationMs` 是来源给的时长，可为空），没有它的旧条目会重新查一次（2026-11-10）；`lrc` 为 null 表示所有在线来源都没有，7 天后重查；`source` 为 `lrclib` / `kugou` / `netease`，没有时是 LRCLIB 的旧条目；开着中文来源时 key 末尾多 `cn`；最多 2000 个文件）。设置项 `lyricsFolder`、`lyricsOnline`（2026-11-10 起默认开，保存过 false 的仍为关）、`lyricsChinese`（也查酷狗和网易云，同样默认开）、`lyricsOffsetMs`。每首歌自己的偏移存在 localStorage `focusd-island-lyrics-offsets`（`{ <歌名歌手时长/2 秒>: 毫秒 }`，±10 秒，最多 500 首）。媒体状态多了 `trackId`：播放器插件写进流派的歌曲 ID（`NCM-<id>`、`QQ-<id>`），`get_lyrics` 的查询多了 `chinese`、`trackId`，返回值多了 `translation`，2026-11-10 起还有可选的 `durationMs`（来源给的歌曲时长，播放器不报告时长时用于进度条）。
- 岛屿设置 `focusd-island-settings` 2026-11-10 新增三个字段：`collapsedPriority`（`["agent","lyrics","todo"]` 的某种顺序，收起的岛先显示哪一样）、`collapsedShowCover`（布尔，默认 false）、`pageOrder`（`["todo","music","clipboard","shelf"]` 的某种顺序，展开岛顶栏的页面圆点）；同日又加 `collapsedLayout`（`["text","mail","shelf","music","agents"]` 的某种顺序，收起的岛上文字和状态图标从左到右的位置，`text` 之前的图标在文字左边）。读取时去掉未知和重复项，缺的按默认顺序补在末尾。
- 岛屿设置 `focusd-island-settings` 的 `pageOrder` 2026-11-11 起多一个可选项 `"translation"`（翻译的页面胶囊），默认顺序 `["todo","music","clipboard","shelf","translation"]`；旧数据缺它时按上面的规则补在末尾，旧版本读到它会当未知项丢掉。
- 岛屿设置 `focusd-island-settings` 2026-11-11 新增 `autoCollapseSeconds`（整数秒 0–600，0 表示从不；鼠标离开展开的岛多少秒后收起）和 `tuckDelaySeconds`（整数秒 3–600，默认 30；收起的岛闲置多少秒后贴边成细线）。`autoCollapseSeconds` 最初只存 3 / 5 / 10 / 30 / 0，这些值照旧有效；非数字或旧数据没有这个字段时：`autoTuck` 为 true 读成 30，否则读成 0；超出范围按边界读。旧版本存过的 `autoTuckSeconds` 不再读取，`tuckDelaySeconds` 缺失时读成 30。
- 岛屿设置 `focusd-island-settings` 的 `expandedScale`（展开后的大小）2026-11-10 重新可以设置；2026-11-11 起是 0.85–1.2 之间的任意值（滑块，步长 0.01）。3.0.0 存的 0.9 / 1 / 1.1（小 / 中 / 大）原样保留；更早版本存的任意数（原范围 0.75–1.4）读取时限制到 0.85–1.2 并取到百分位，非数字按 1。字段名和类型不变。
- 岛屿设置 `focusd-island-settings` 的 `gameDoNotDisturb`（布尔，默认 true）2026-11-11 重新可以设置（通用 → 岛屿 → 游戏模式）：只有明确存为 false 才关；`gameAutoTuck` 仍按默认 false 读取。字段名和类型不变，没有新 key。
- 岛屿设置 `focusd-island-settings` 新增 `positionLocked`（布尔，默认 false）：只在明确保存为 true 时禁止拖动。旧数据缺失或类型无效时保持可拖动。`set_island_interaction` 增加可选参数 `positionLocked`，缺失时按 false；`start_island_drag` 在锁定时不启动拖动。复位和贴边隐藏不受影响。
- Agent 页显示方式（2026-11-07 起）：设置项 `agentSessionView`（`list` / `cards` / `compact`，默认 `list`）、`agentArchiveMotion`（`slide` / `dissolve`，默认 `slide`）、`agentCardEffects`（`off` / `sparkle` / `gradient`，默认 `off`）；`AgentSessionSummary.contextTokens`（最近一次模型调用的上下文 tokens，Claude Code 取 usage 的输入、缓存读写与输出之和，Codex 取 `token_count` 的 `last_token_usage.total_tokens`；不知道时为 null）。
- 回复状态标记（2026-11-08 起换位置）：写在 Claude 配置目录（`CLAUDE_CONFIG_DIR`，默认 `~/.claude`）下的 `rules/focusd-island-reply-marker.md`，块标记 `<!-- focusd-island: reply marker v2 -->`；关掉时只删除含这个标记的文件。v1 写在 `CLAUDE.md` 里的块在打开或关掉时移除，`CLAUDE.md` 的其他内容不动；软链文件一律不写。
- Agent 页排列（2026-11-08 起）：设置项 `agentSessionSort`（`status` / `recent` / `firstSeen`，默认 `status`；旧数据没有这个字段时按 `status`，会改变升级前的顺序）、`agentSessionGroup`（`computer` / `project` / `none`，默认 `computer`）；`agentHostDisplay` 的默认值改为 `icon`（已保存的值不变）。

- 待办设置（2026-11-12）：现有 `focusd-island-settings` 对象增加 `todoTimerEnabled`（boolean，默认 false，仅接受 boolean）、`todoReorderVersion`（固定 1）；`enableTodoReorder` 默认 true。缺少版本标记的旧数据一律开启拖拽，有 `todoReorderVersion: 1` 时才尊重布尔值。没有新增 key 或修改待办数据格式；关闭计时器删除本轮 `focusd-island-todo-timer`，保留进行中 ID 和各项时长。
- 待办各项时长（2026-11-12）：新增 `focusd-island-todo-durations`（`{ [todoId]: 分钟 }`），取代所有待办共用的 `focusd-island-todo-duration`。不迁移旧值：用户明确要求每项待办独立，新待办都从 15 分钟起；旧 key 留在原处不读取。直接点“开始”不再启动倒计时，只有怀表设置里的开始才计时。

总览见 [overview.md](overview.md)。
# 网易云精准进度插件

- 命令：`netease_plugin_status()` 返回 `NeteasePluginStatus`（state、supported、tested、version、arch、installDir、running、legacyInfLink、pluginDir）；`install_netease_plugin()` / `uninstall_netease_plugin()` 返回 `{ keptForeignLoader, preservedFiles }`。
- 错误统一为 `{ kind, detail }`，kind 为 Unsupported / NeedsClose / LegacyConflict / HashMismatch / Network / UserDeclined / Busy / Io。
- 事件 `media-plugin-progress`：`{ stage: downloading|verifying|copying|done|error, detail?: string|null }`。
- 应用数据 `media-plugins.json`：`{ version: 1, files: [{ path, sha256 }], installedAt }`，installedAt 为 Unix 秒。仅记录本应用写入的文件；卸载只删除仍与记录哈希一致的文件，替换文件保留并返回路径；记录损坏或未知版本容错为空。
- 启动参数 `--media-plugin-copy <源> <目标> <sha256>`、`--media-plugin-remove <目标> <sha256>` 在 Tauri 和 single-instance 初始化前处理并退出。只接受固定清单的加载器哈希，目标必须为绝对路径 `msimg32.dll`，父目录须有 `cloudmusic.exe`，禁止 `..`、链接与特殊路径。复制前校验源文件，删除前校验目标文件；不启动正常应用窗口。
- 播放器诊断新增 `neteasePluginInactive`：已安装插件但仍无时间线，提示重启及可能不兼容。

