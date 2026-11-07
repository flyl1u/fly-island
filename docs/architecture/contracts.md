# 对外契约清单

纯重构中下列标识不得改变，规则见根目录 [AGENTS.md](../../AGENTS.md#对外契约不得随意变更)。新增契约时同步更新本节。

## localStorage key

| key | 当前定义位置 |
|---|---|
| `focusd-island-settings` | `features/appearance/storage.ts` |
| `focusd-island-collapsed-text-default-v1`（迁移标记） | `features/appearance/storage.ts` |
| `focusd-island-setting-presets` | `features/appearance/storage.ts` |
| `focusd-island-todos`（这一行到 `focusd-island-daily-note` 的 6 个待办 key：迁移到 `todos.json` 后只在启动时读取用于迁移，不再写入也不删除，保留给旧版本用） | `features/todos/storage.ts` |
| `focusd-island-active-todo` | `features/todos/storage.ts` |
| `focusd-island-current-date` | `features/todos/storage.ts` |
| `focusd-island-archives` | `features/todos/storage.ts` |
| `focusd-island-scheduled-todos`（安排在以后日期的待办，`{ id, title, date, createdAt }[]`） | `features/todos/storage.ts` |
| `focusd-island-daily-note` | `features/todos/storage.ts` |
| `focusd-island-todos-migrated-v1`（`{ at }`：待办已迁移到 `todos.json`；只是标记，是否迁移以 `todos.json` 里的 `migration.sourceHash` 为准） | `features/todos/storage.ts` |
| `focusd-island-save-directory` | `features/todos/storage.ts` |
| `focusd-island-last-saved-signature` | `features/todos/storage.ts` |
| `focusd-island-position` | `windows/island/storage.ts` |
| `focusd-island-music-sources` | `features/media/storage.ts` |
| `focusd-island-settings-focus`（主窗口 → 设置窗口的跳转请求） | `windows/settings/storage.ts` |
| `focusd-island-position-reset`（设置窗口 → 主窗口：让岛回到主屏顶部居中，`{ requestedAt }`，超过 5 秒的请求忽略） | `windows/settings/storage.ts` |
| `focusd-island-panel-preview`（设置窗口 → 主窗口：拖动尺寸滑块时让岛展开或收起预览，`{ mode, requestedAt }`，超过 2 秒的请求忽略） | `windows/settings/storage.ts` |
| `focusd-island-qq-mail-settings` | `features/messages/mail/storage.ts`（`{ accounts: [{ email, host, enabled }] }`，兼容读取旧的单账户 `{ email, enabled }`，解析在 `mailAccounts.ts`） |
| `focusd-island-qq-mail-remote-images` | `features/messages/mail/storage.ts` |
| `focusd-island-qq-notifications-enabled` | `features/messages/qq-notifications/storage.ts` |
| `focusd-island-qq-notification-access-requested` | `features/messages/qq-notifications/storage.ts` |
| `focusd-island-wechat-reminders-enabled` | `features/messages/wechat/storage.ts` |
| `focusd-island-translation-settings` | `features/translation/storage.ts` |
| `focusd-island-agent-approval`（`{ onIsland, whenInFront }`：Agent 的权限请求在岛上审批，默认关；`whenInFront` 为会话窗口在前台时也弹卡片，默认关，旧数据缺这个字段按关处理；开着时岛屿让审批端点挂起请求） | `features/agent-status/approvals/storage.ts` |
| `focusd-island-agent-push`（`{ enabled, server, events: { waiting, completed, failed }, awayMinutes }`：用 Bark 推送到手机，默认关；`server` 空为 Bark 官方服务器；`awayMinutes` 为 0 / 2 / 5 / 10，默认 5。设备 Key 不在这里，在凭据 `com.focusd.island.bark`） | `features/agent-status/push/storage.ts` |
| `focusd-island-agent-hidden-sessions`（`{ "<provider>:<sessionId>": updatedAt }`：在 Agent 页手动移除的会话，只隐藏不删记录；值是移除时那一轮的开始时间（以前存的是最后写入时间），开始新一轮才自动回来，最多 200 条） | `features/agent-status/hiddenSessions.ts` |
| `focusd-island-agent-seen-turns`（`{ "<provider>:<sessionId>": 轮次 }`：在 Agent 页看过的会话，轮次是这一轮的开始时间，卡在半路时是最后写入时间；重启岛屿后看过的不再提醒，最多 300 条） | `features/agent-status/unseen.ts` |
| `focusd-island-agent-session-filters`（`[{ kind: "folder" | "prompt", value }]`，最多 50 条：按所在目录（含子目录，不分大小写和斜杠方向）或标题 / 最近提示词包含的文字隐藏会话，B6.4.3；读取时丢掉格式不对、为空和重复的条目；设置备份包含它） | `features/agent-status/sessionFilters.ts` |
| 设置备份文件（`fly-island-settings-<日期时间>.json`，写到「下载」文件夹；`{ app: "fly-island", version: 1, exportedAt, keys }`，`keys` 只含 `features/settings-backup/backup.ts` 的 `BACKUP_KEYS`：不含待办、窗口位置、凭据和一次性请求；恢复时只写这些 key，未知 key 和非字符串值丢弃） | `features/settings-backup/` |
| `focusd-island-translation-handoff`（主窗口 → 翻译窗口：选中文字的快捷翻译结果 `{ source, output, requestedAt, openRequestedAt }`；点击岛上那一行后 5 秒内打开才会带入，结果超过 60 秒忽略） | `features/translation/storage.ts` |
| `focusd-island-locale` | `i18n/index.ts` |
| `focusd-island-update-preferences`（`{ autoCheck, skippedVersion, lastCheckedAt }`：后台自动检查开关、跳过的版本、上次检查成功的时间；设置窗口写，主窗口通过 `storage` 事件跟随） | `features/updater/storage.ts` |
| `focusd-island-update-channel`（`"stable"` / `"beta"`；没有时 beta 版本按 `beta`、其他版本按 `stable`） | `features/updater/storage.ts` |
| `focusd-island-plugin-pages`（`{ order, hidden }`：岛上插件页面的顺序和隐藏的页面，值为页面 id `plugin:<插件 id>/<view id>`；设置窗口写，主窗口通过 `storage` 事件跟随） | `features/plugin-views/storage.ts` |

## 事件

| 事件名 | 发送方 | 目标 |
|---|---|---|
| `island-position-changed` | `island/mod.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-position-cleared`（无载荷：岛屿跟随鼠标或前台窗口换了显示器，拖动保存的位置作废，主窗口清掉 `focusd-island-position`） | `island/follow.rs` | 主窗口 |
| `island-top-attachment-changed`（载荷为 `bool`：岛屿是否贴住所在显示器顶边） | `island/top_edge.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-hover-changed`（载荷为 `bool`：光标是否在岛屿形状内，供悬停展开使用） | `island/passthrough.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-cursor-moved`（载荷 `{ x, y }`：光标在主窗口 CSS 像素中的位置，窗口外也有；只在 `set_island_cursor_tracking(true)` 后、光标移动时发，约 28 次/秒，供中心图案的眼睛跟随） | `island/passthrough.rs` | 广播（通过主窗口对象调用 `emit`） |
| `foreground-fullscreen-changed`（载荷为 `{ active, onIslandMonitor }`：前台是否有全屏程序、是否占住岛所在的显示器，供游戏模式使用） | `system/fullscreen.rs` | 广播 |
| `clipboard-history-changed` | `clipboard_history/service.rs`（常量在 `mod.rs`） | 广播 |
| `clipboard-history-shortcut` | `clipboard_history/service.rs`（常量在 `hotkey.rs`） | 广播 |
| `clipboard-history-shortcut-status`（载荷为字符串或 `null`：剪贴板快捷键注册失败的原因，成功或关闭时为 `null`；最近一次结果也可用 `get_clipboard_shortcut_error` 读取） | `clipboard_history/hotkey.rs` | 广播 |
| `qq-mail-changed` | `mail/service.rs`（常量在 `mod.rs`） | 广播 |
| `qq-notifications-changed` | `qq_notifications/mod.rs` | `main`、`settings` |
| `wechat-reminder-changed` | `wechat_reminders/mod.rs` | `main`、`settings` |
| `translation-window-opened` | `translation/mod.rs` | 广播 |
| `translation-selection`（载荷为 `string`：「翻译选中文字」快捷键取到的文字，没有可译内容时为空字符串） | `translation/mod.rs` | 广播 |
| `translation-island-shortcut`（翻译设为「岛内页面」时按下翻译快捷键：先唤出主窗口，再让它切换翻译页） | `translation/mod.rs` | 广播 |
| `agent-approval-requested`（载荷 `{ id, agent, kind, sessionId, cwd, toolName, toolInput, permissionSuggestions, receivedAt }`：一个会话等你在岛上审批的工具调用（`kind: "permission"`），或要你回答的 AskUserQuestion（`kind: "question"`，`toolInput.questions`），同一会话同时只发一条） | `agent_approval/mod.rs` | 广播 |
| `agent-approval-closed`（载荷 `{ id, reason }`，`reason` 为 `decided` / `timeout` / `disconnected` / `handedBack` / `shutdown`） | `agent_approval/mod.rs` | 广播 |
| `local-api-request`（载荷 `{ id, method, params }`，前端用 `answer_local_api_request` 回复） | `local_api/bridge.rs` | `main` |
| `plugin-host-event`（载荷 `{ name, payload }`：插件可订阅的变化，由 Rust 合并后转给订阅的插件；`name` 见 `plugins/schema/rpc.json` 的 `events`） | 主窗口 `windows/island/usePluginHostEvents.ts` | Rust（`plugin_host/events.rs`） |
| `plugin-notification`（载荷 `{ pluginId, pluginName, title, body, durationMs, actions }`：插件的 `island.notify`，按钮用 `run_plugin_notification_action` 回复） | `plugin_host/notify.rs` | `main` |
| `plugin-keybinding`（载荷 `{ pluginId, command, when }`：插件命令的全局快捷键被按下，主窗口求值 `when` 后用 `run_plugin_command` 执行） | `plugin_host/keybindings.rs` | `main` |
| `todos-changed`（载荷 `{ revision, data, fields, reason }`：插件或本地接口改了 `todos.json`，主窗口只采纳 `fields` 列出的字段） | `todos/service.rs` | `main` |
| `plugin-permission-request`（载荷 `{ requestId, pluginId, pluginName, permission, timeoutMs }`：插件第一次使用敏感权限，主窗口显示确认，用 `answer_plugin_permission` 回复） | `plugin_host/sensitive.rs` | `main` |
| `file-shelf-changed`（无载荷：插件改了文件中转列表，主窗口重新读取） | `file_shelf/plugin_view.rs` | `main` |
| `plugin-view-changed`（载荷 `{ kind: "view", pluginId, viewId, model }`：可见的插件页面有新模型；`{ kind: "status", pluginId, itemId, status }`：折叠条状态文字变了；`{ kind: "reset", pluginId, status }`：插件进程启动、停止或崩溃。每个页面或状态项每秒最多 10 次） | `plugin_host/views.rs` | `main` |

## 其他

- 窗口 label：`main`、`translation`、`settings`；前端分发参数为 `?window=translation`、`?window=settings`。
- Tauri 命令：以 `lib.rs` 中 `generate_handler!` 列表为准，命令名即 Rust 函数名。
- 应用标识 `com.focusd.island`，凭据服务名 `com.focusd.island.qq-mail`、`com.focusd.island.translation`、`com.focusd.island.calendar`（2026-11-07 起，账户名为日历 id，存 ICS 订阅链接或 CalDAV 密码）、`com.focusd.island.bark`（2026-11-07 起，账户名 `device-key`，存 Bark 设备 Key，`phone_push/mod.rs`）。
- 注册表值：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 下的 `FocuSD Island`。
- Hook 受管区块标记：`# BEGIN/END FocuSD Agent Status Hooks`，命令签名前缀 `focusd-agent-`。
- 更新端点与 `latest.json` 格式：见 `tauri.conf.json` 和 `docs/updater.md`。
- 插件市场：索引地址 `https://raw.githubusercontent.com/TixXin/fly-island/main/plugins/index.json`（fork 仓库的 `main` 分支；2026-11-05 之前的版本读 `dev`，推送时 `dev` 与 `main` 保持同一提交）、`index.json` 格式（`version: 1`）与 `plugins/packages/<id>-<version>.zip` 文件名；已发布的版本不得修改内容。索引签名 `index.json.sig`（`{ keyId, signature }`，Ed25519）与可信公钥列表 `plugins/signing-keys.json`；签名私钥在 `~/.tauri/fly-island/plugin-index-signing.key`（DPAPI），不在仓库中。插件平台 P11（2026-11-05）新增：`index.json.sig` 也可以是 `{ keyId, signature }` 的数组（任一可信签名即通过）；撤销名单 `plugins/revoked.json`（`version: 1`，条目 `{ id, versions: "*" | [...], reason, action: "disable" | "uninstall" }`）与 `revoked.json.sig`，与索引从同一提交读取，不存在时视为空；索引条目字段 `publisher`、`repo`、`categories`、`preRelease`（源头是 `plugins/market/<id>.json`，没有 `publisher` 时为官方发布者 `TixXin`）；`plugins.json` 字段 `revoked`、`trustedPublishers`、`autoUpdate`；`PluginInfo.revoked` / `updateAvailable` / `autoUpdated`、`PluginsSnapshot.autoUpdate` / `trustedPublishers`、`MarketPlugin.publisher` / `repo` / `categories` / `revoked`、`MarketSnapshot.trustedPublishers` / `officialPublisher`；Tauri 命令 `set_plugin_auto_update`、`set_plugin_publisher_trusted`、`check_plugin_updates`。插件平台 P8（2026-11-05）新增：清单 `contributes.views[].template: "webview"` 与 `entry`、`height`；方法 `webview.postMessage`、通知 `webview.message`、能力 `webview`；页面来源 `https://<插件 id>.plugin.focusd.invalid` 与页面 API `acquireFocusdApi()`（`locale`、`postMessage`、`onMessage`、`getState`、`setState`）；`PluginViewEntry.height`；索引字段 `webview`；Tauri 命令 `show_plugin_webview`、`hide_plugin_webview`。页面是不经过 Tauri 的独立 WebView2（`win32/webview_page.rs`），见 [p8-webview-validation.md](p8-webview-validation.md)。之后新增 Tauri 命令 `get_cached_plugin_market`（本次运行中最近一次通过签名校验的市场，不联网；没有时为 `null`）；从市场安装时复用 10 分钟内读到的索引。全部可省略，旧格式照常接受。
- 插件：`focusd-plugin.json` 清单格式、`plugins.json` 字段、JSON-RPC 方法与通知、错误码、`FOCUSD_PLUGIN_*` 环境变量，见 [docs/plugins/README.md](../plugins/README.md)；机器可读的描述在 `plugins/schema/manifest.schema.json` 与 `plugins/schema/rpc.json`（`plugin_host/tests.rs` 对照检查）。插件 API 第 2 版（2026-11-05）新增：清单 `apiVersion: 2`、`contributes.commands[].keybinding` / `when`、`contributes.menus["todo/context"]`；`initialize.capabilities`；方法 `events.*`、`island.notify`、`storage.*`、`secrets.*`，通知 `event`、`notification.action`，`command` 的 `args`；权限 `agent-status:read`、`island:notify`、`secrets`；`plugins.json` 授权项字段 `notificationsMuted`；文件 `plugins-data/<id>/storage.json` 与 `plugin-secrets.json`（各插件已存秘密的名称）；凭据服务名 `com.focusd.island.plugin.<id>`；Tauri 命令 `run_plugin_notification_action`、`set_plugin_notifications_muted`、`clear_plugin_data`、`list_plugin_menu`、`run_plugin_menu_command`。全部是新增，`apiVersion: 1` 插件的行为不变。插件平台 P6（2026-11-05）新增：权限 `clipboard:read`、`messages:read`、`media:read`、`shelf:read`、`shelf:write`（敏感，首次使用时在岛上确认）与 `media:control`；方法 `clipboard.history`、`messages.list`、`media.nowPlaying`、`media.playPause` / `next` / `previous`、`shelf.list` / `add` / `remove`；事件 `clipboard.changed`、`messages.received`、`media.changed`，`todos.changed` 增加 `reason`；`plugins.json` 授权项字段 `sensitive`（`{ <权限>: "allowed" | "denied" }`）；Tauri 命令 `answer_plugin_permission`、`revoke_plugin_sensitive_permission`。凭据（QQ 邮箱授权码、翻译密钥）不对插件开放。插件平台 P7（2026-11-05）新增：清单 `contributes.views`（`list` / `detail` / `form` / `status` 模板，图标只能用 schema 里列出的 lucide 名称）与 `contributes.statusItems`；方法 `view.update`、`view.patch`、`status.update`，通知 `view.visible`、`view.action`、`view.submit`、`view.search`；`initialize.capabilities` 增加 `views`、`status`；岛上页面 id `plugin:<插件 id>/<view id>`（排在内置页面之后）；Tauri 命令 `list_plugin_views`、`set_plugin_view_visible`、`run_plugin_view_action`、`submit_plugin_view`、`search_plugin_view`、`restart_plugin`。插件只发数据，不发界面代码。插件平台 P9（2026-11-05）新增：清单 `activationEvents`（`onStartup`、`onStartupFinished`、`onCommand:<id>`、`onView:<id>`、`onEvent:<名称>`、`onSchedule:<分钟>`；不写时随岛屿常驻，第 1 版插件忽略）；`initialize.activationEvent`（第 2 版）；方法 `host.keepAlive`；插件状态 `idle`（`PluginStatus` 新增取值）。插件进程树放在 Windows Job Object 中，随插件结束。插件平台 P10（2026-11-05）新增：清单 `experimentalApis`（只有开发模式加载的插件能用，插件目录里的插件写了它就无法使用）；`initialize.experimentalApis`；本地接口 `POST /v1/dev/plugins`、`POST /v1/dev/plugins/{id}/reload`、`DELETE /v1/dev/plugins/{id}`、`GET /v1/dev/plugins/{id}/log`（只在开发模式打开时可用）；`PluginInfo.dev`；Tauri 命令 `get_plugin_dev_state`、`set_plugin_dev_mode`、`load_dev_plugin`、`reload_dev_plugin`、`unload_dev_plugin`、`get_plugin_rpc_trace`、`send_plugin_dev_event`。开发模式只在内存中，不写入 `plugins.json`。npm 包 `fly-island-plugin`、`create-fly-island-plugin` 与 PowerShell 模块 `FlyIsland.Plugin` 的源码在 `packages/`，`plugins/sdk/` 的单文件 SDK 和 `docs/plugins/api.md` 由 `pnpm sdk:build` 生成。
- 待办数据（P6，2026-11-05 起，**数据位置的契约变更**）：`todos.json`（`{ version: 1, revision, migration?, date, todos, scheduled, archives, dailyNote, activeTodoId }`，字段形状与原 localStorage 一致）及上面列出的备份文件；Tauri 命令 `migrate_todos`、`get_todos_state`、`apply_todos_change`（`baseRevision` 之后被插件或本地接口改过的字段不会被覆盖）；事件 `todos-changed`。待办数据在 `todos.json` 时，插件和本地接口的 `todos.*` / `note.*` 由 Rust 直接读写；迁移失败、退回 localStorage 的那次运行仍经 `local-api-request` 由主窗口回答，所以该事件保留。
- 本地接口：首选端口 `39271`、`/v1/` 下的路径与 JSON 格式、`local-api.json` 字段，见 [docs/local-api.md](../local-api.md)。自 2026-11-04 起它是内置插件 `focusd.local-api`（插件 id 与设置键 `allowWrite` 也属于契约），命令 `get_local_api_state`、`set_local_api_settings`、`reset_local_api_token` 已删除。
- 在岛上审批（2026-11-06 起）：端点路径 `POST /claude/permission-request`、`POST /codex/permission-request`，以及 Claude Code `PreToolUse` 钩子的 `POST /claude/ask-user-question`（只接 AskUserQuestion，回答以 `updatedInput.answers` 返回）（`Authorization: Bearer <令牌>`，`Host` 须为本机端口，带 `Origin` 的请求拒绝），返回 Claude Code `PermissionRequest` 钩子的格式，空对象 `{}` 表示交还终端；`agent-approval.json` 字段 `port`、`token`；Tauri 命令 `set_agent_approval_enabled`、`agent_approval_decide`（`decision` 为 `allow` / `deny` / `allowAlways` / `terminal`；提问为 `answer` 加 `answers`（问题原文 → 回答）或 `terminal`）、`agent_approval_pending`；事件见上表。
- 歌词缓存（2026-11-06 起）：应用数据目录下的 `lyrics-cache/<FNV-1a 哈希>.json`（`{ key, lrc, source?, translation?, wordTimes?, fetchedAt }`；`lrc` 可带增强 LRC 的逐字时间 `<mm:ss.xx>`（酷狗 KRC 转来）；`wordTimes` 为 true 的条目由保留逐字时间的版本写入，没有它的酷狗旧条目会重新下载；`lrc` 为 null 表示所有在线来源都没有，7 天后重查；`source` 为 `lrclib` / `kugou` / `netease`，没有时是 LRCLIB 的旧条目；开着中文来源时 key 末尾多 `cn`；最多 2000 个文件）。设置项 `lyricsFolder`、`lyricsOnline`（默认关）、`lyricsChinese`（也查酷狗和网易云，默认关）、`lyricsOffsetMs`。每首歌自己的偏移存在 localStorage `focusd-island-lyrics-offsets`（`{ <歌名歌手时长/2 秒>: 毫秒 }`，±10 秒，最多 500 首）。媒体状态多了 `trackId`：播放器插件写进流派的歌曲 ID（`NCM-<id>`、`QQ-<id>`），`get_lyrics` 的查询多了 `chinese`、`trackId`，返回值多了 `translation`。
- 日历（2026-11-07 起，见 [calendar.md](../calendar.md)）：应用数据目录下的 `calendar-sources.json`（`[{ id, kind: "ics" | "caldav", name, url, host, username }]`，不含密码和订阅链接）；Tauri 命令 `get_calendar_events(refresh)`、`list_calendar_sources`、`add_calendar_source(kind, name, url, username, secret)`、`remove_calendar_source(id)`；设置项 `calendarEnabled`（默认开，没添加日历时不显示日历页）、`calendarRemindMinutes`（0/5/10/15/30，默认 10）、`calendarShowTitle`（默认开）；岛屿页面 id `calendar`，设置窗口分类和跳转请求 `calendar`。
- SSH 远程会话（2026-11-06 起）：Tauri 命令 `list_ssh_hosts`、`get_agent_remote_hosts`（返回 `{ host, fetchedAt, error, fetching }[]`）、`set_agent_remote_hosts`（参数 `hosts`）；`AgentSessionSummary.remoteHost` 也用于 SSH 读来的会话；`AgentSessionSummary.closed`（agent 已退出）与设置项 `agentHideClosed`（默认开）；应用数据目录文件 `agent-remote-hosts.json`（`{ hosts: string[] }`）与 `remote-sessions/<Host>/`。
- VS Code 扩展（2026-11-06 起）：扩展 ID `tixxin.focusd-island`（源码 `packages/vscode-extension/`），岛屿打开 `<编辑器 scheme>://tixxin.focusd-island/focus?pids=<进程号,…>&title=<会话标题>`；发布后再改格式时，岛屿和扩展都要兼容旧格式，见 [docs/agent-status-hooks.md](../agent-status-hooks.md)。

总览见 [overview.md](overview.md)。
