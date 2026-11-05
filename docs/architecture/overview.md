# 架构总览

本文描述 FocuSD Island 的运行时架构、目标代码结构、从现有文件到目标位置的迁移映射，以及对外契约清单。编码规则见 [AGENTS.md](../../AGENTS.md)、[src/AGENTS.md](../../src/AGENTS.md) 和 [src-tauri/AGENTS.md](../../src-tauri/AGENTS.md)，迁移步骤见 [refactor-plan.md](refactor-plan.md)，插件系统提案见 [plugins.md](plugins.md)。

## 运行时架构

```text
┌──────────────────────── WebView2（同一前端包，按 ?window= 分发）────────────────────────┐
│  main：悬浮岛            translation：快捷翻译            settings：设置（按需创建）       │
└────────────┬─────────────────────────────────────────────────────────────────────────┘
             │ invoke（命令，请求/响应）        ▲ emit / emit_to（事件，后端主动推送）
             ▼                                │
┌──────────────────────────────── Rust（Tauri 2）──────────────────────────────────────┐
│  lib.rs 组装：插件 / setup / 托盘 / generate_handler!                                  │
│  领域模块：island · agent_status · system · clipboard_history · file_shelf · media_control │
│           local_api（127.0.0.1 HTTP，内置插件 focusd.local-api，请求经事件转给 main 窗口） │
│           plugin_host（插件子进程，stdio JSON-RPC，按权限经 local_api 调用 main 窗口）     │
│           qq_mail · qq_notifications · wechat_reminders · translation · settings_window │
│  后台服务：IMAP IDLE 收信、剪贴板监听、通知监听、微信窗口闪烁检测、鼠标穿透循环        │
└────────────┬─────────────────────────────────────────────────────────────────────────┘
             ▼
   Windows：Win32 / WinRT（SMTC 媒体、音频端点、通知监听、注册表、窗口）、凭据管理器
```

### 数据存放位置

| 数据 | 位置 | 负责方 |
|---|---|---|
| 设置、预设、各功能开关、语言 | WebView2 的 `localStorage` | 前端各 feature 的 `storage.ts` |
| 待办、以后的待办、每日笔记、归档、正在进行的待办、待办日期（2026-11 起；更早的版本存在 `localStorage`，首次启动时迁移） | 应用数据目录（`todos.json`；迁移时的原文备份 `todos-migration-backup.json` / `todos-migration-backup-<毫秒>.json`；旧版本改过数据后重新导入前的备份 `todos.before-reimport-<毫秒>.json`；这些备份都不会自动删除） | `todos`（Rust）、`features/todos/todoStore.ts` |
| AI 代理状态与运行标记、hook 脚本 | 应用数据目录（`agent-status.json`、`agent-*-running*.flag`、`focusd-agent-*.{cmd,ps1}`；`agent-claudeCode-notification.json` 为 Claude Code 最近一次"等待授权 / 等待输入"通知的 hook 输入，只用于判断会话是否在等你，清除状态时删除；旧版保存的 `agent-*-hook-input.json` 在安装/修复时删除） | `agent_status`（会话列表在 `sessions.rs`、`session_scan.rs`，等待判断在 `notifications.rs`，标题与提问文字处理在 `title.rs`） |
| 文件中转列表（只存路径，不复制文件） | 应用数据目录（`file-shelf.json`） | `file_shelf` |
| 设置窗口上次关闭时的大小与位置（位置已不在任何屏幕上时忽略） | 应用数据目录（`settings-window.json`） | `settings_window/bounds.rs` |
| 插件：已安装插件、启用与授权状态、插件私有数据 | 应用数据目录（`plugins/<id>/`、`plugins.json`、`plugins-data/<id>/`，见 [docs/plugins/README.md](../plugins/README.md)） | `plugin_host` |
| 本地接口端口与访问令牌（脚本也会读取）；开关与"允许修改"由内置插件 `focusd.local-api` 在 `plugins.json` 中保存，并同步写入此文件供脚本参考 | 应用数据目录（`local-api.json`，见 [docs/local-api.md](../local-api.md)） | `local_api`、`plugin_host/builtin.rs` |
| Codex / Claude Code hook 配置 | `~/.codex/config.toml`、`~/.claude/settings.json` 中带标记的受管区块 | `agent_status` |
| QQ 邮箱授权码、翻译 API 密钥 | Windows 凭据管理器（`com.focusd.island.qq-mail`、`com.focusd.island.translation`；翻译密钥按服务分条目，用户名为服务 id，DeepSeek 沿用 `deepseek`） | `qq_mail`、`translation` |
| 待办 Markdown 导出 | 用户选择的目录（经过校验） | `system` |
| 开机自启 | `HKCU\...\Run` 下的值 `FocuSD Island` | `system` |
| 剪贴板历史、通知、邮件正文 | 仅保存在内存中 | 各服务模块 |

## 目标结构

前端和 Rust 的目标目录树，以及各目录的职责，分别见 [src/AGENTS.md](../../src/AGENTS.md#目标结构) 和 [src-tauri/AGENTS.md](../../src-tauri/AGENTS.md#目标结构)。本文只记录迁移映射。

### 前端依赖方向

```text
main.tsx → windows/ → features/ → components/、lib/、utils/、i18n/、styles/
```

## 迁移映射：前端

以下是初版映射，具体归属在执行对应步骤时根据代码再确认。如有调整，在本表中更新。

| 现有位置 | 目标位置 |
|---|---|
| `App.tsx`：`App`、`IslandApp`、`IslandShell` | `windows/island/IslandApp.tsx`（`App` 包装已去掉，`main.tsx` 直接渲染 `IslandApp`）、`IslandShell.tsx`；外壳拆出 `IslandCollapsedBar.tsx`、`IslandHeader.tsx` 与 `useGlassPointer.ts`、`useIslandPreparing.ts`、`useWindowDragGesture.ts`。`IslandApp` 的导航、快捷键、折叠态待办摘要、展开高度、舞台样式分别在 `useIslandNavigation.ts`、`useIslandKeyboard.ts`、`useCollapsedTodo.ts`、`expandedHeight.ts`、`stageStyle.ts`；外观设置的持久化与同步在 `features/appearance/useIslandSettings.ts` |
| `App.tsx`：窗口尺寸、展开高度、拖拽、位置、贴边相关的 state 与 effect | `windows/island/useIslandWindow.ts`（组合原生同步）、`useNativeLayout.ts`（缩放与边距，每帧至多一次调用）、`useIslandPosition.ts`（拖拽位置）、`api.ts`。展开高度仍由 `IslandApp` 按页面内容算好后传入；贴边收起的 mode 状态在 `useIslandNavigation.ts`。`topEdge.ts` 把原生顶边贴合写到根元素 `data-island-top-edge`，`IslandTopEdge.css` 据此绘制平顶与反向圆角 |
| `App.tsx`：`openSettingsWindow` 与设置区块跳转 | `windows/settings/api.ts` |
| `App.tsx`：`TodoNotebook`、`ArchiveBrowser` | `features/todos/` |
| `App.tsx`：待办、归档、笔记的 load / normalize、Markdown 格式化、`createTodoId` | `features/todos/storage.ts`、`markdown.ts` |
| `App.tsx`：`MusicPlayerPanel`、`MusicWaveButton`，`MediaState` 比较 | `features/media/` |
| `MediaWaveform.tsx/.css` | `features/media/` |
| `App.tsx`：`ClipboardHistoryPanel`，快捷键解析与匹配 | `features/clipboard/`（快捷键逻辑放 `shortcut.ts`） |
| `App.tsx`：`AppearanceModeControl`，设置与预设的 load / normalize / merge | `features/appearance/` |
| `App.tsx`：`LayoutEditor` 外壳（设置窗口页面，只做组合） | `windows/settings/` |
| `App.tsx`：`LayoutEditor` 的各区块 | 所属领域：布局 / 颜色 / 预设 → `features/appearance/`，保存路径 → `features/todos/`，剪贴板 → `features/clipboard/`，AI 代理钩子 → `features/agent-status/`，消息 → `features/messages/`，项目链接 → `features/updater/`，语言 → `i18n/` |
| `App.tsx`：`hexToRgba` | `features/appearance/`（它以外观默认值 `DEFAULT_SETTINGS.pulseColor` 作回退色，不是纯通用函数，随 2.4 迁移） |
| `App.tsx`：`SliderControl`、`ColorControl`、`ToggleControl`、`NumberControl` | `components/controls/` |
| `App.tsx`：`LocaleControl` | `i18n/LocaleControl.tsx` |
| `App.tsx`：代理状态的 label / 视觉状态函数 | `features/agent-status/` |
| `App.tsx`：`clamp`、颜色校验（`HEX_COLOR_PATTERN`、`getColorSetting`）、日期格式化（`getLocalDateString`、`getDisplayDateParts`）、`getErrorMessage` | `utils/number.ts`、`color.ts`、`date.ts`、`error.ts` |
| `App.css` | 拆分到各组件的同名 `.css`（已删除）：岛屿外壳、折叠条、页头 → `windows/island/IslandShell.css`、`IslandCollapsedBar.css`、`IslandHeader.css`；品牌图标 → `features/messages/MessageSourceIcon.css`；跨领域规则（`.stage`、`.icon-button`、面板玻璃背景、保存勾选动画、减少动效列表）→ `windows/island/IslandApp.css`；全局部分放到 `styles/tokens.css`（4.2 新增，颜色 / 圆角 / 间距变量）、`base.css`、`fonts.css` |
| `Messages.tsx/.css`、`MessageSourceIcon.tsx`、`CollapsedMessageContent.tsx/.css`、`messagePreview.ts`、`qqNotificationTiming.ts` | `features/messages/` |
| `QQMail.tsx/.css` | `features/messages/qq-mail/` |
| `QQNotifications.tsx/.css` | `features/messages/qq-notifications/` |
| `WeChatReminders.tsx/.css` | `features/messages/wechat/` |
| `UpdatePanel.tsx/.css`、`updaterController.ts` | `features/updater/` |
| `useIslandAutomation.ts` | `windows/island/useIslandAutomation.ts` |
| `SettingsWindow.tsx/.css` | `windows/settings/` |
| `TranslationWindow.tsx/.css` | `windows/translation/`（翻译的 `api.ts`、`storage.ts`、`providers.ts` 在 `features/translation/`） |
| `utils/text.ts`、`i18n/`、`assets/` | 保持不动 |

## 迁移映射：Rust

| 现有位置 | 目标位置 |
|---|---|
| `lib.rs`：`run()`、插件、setup、`generate_handler!` | 保留在 `lib.rs`；命令清单已移到各模块 `mod.rs` 的 `tauri_commands!`，`lib.rs` 用 `collect_commands!` 汇总 |
| `lib.rs`：托盘创建与事件 | `tray.rs`（5.3 已完成） |
| `lib.rs`：`IslandWindowState`、布局/交互/拖拽/位置命令、几何计算、毛玻璃、鼠标穿透、动画 | `island/{mod, state, geometry, glass, passthrough, focus, top_edge, tests}.rs`（5.1 已完成：`mod.rs` 放命令与窗口访问，`state.rs` 放状态类型与全局状态，`geometry.rs` 放尺寸常量、定位与贴边动画，`top_edge.rs` 负责顶边贴合判断与拖放吸附，`focus.rs` 在光标停在展开面板上时获取并归还键盘焦点） |
| `lib.rs`：代理状态快照、运行标记、Codex / Claude Code hook 安装、`write_text_file`（只有 hook 安装使用） | `agent_status/{mod, snapshot, markers, codex_hooks, claude_hooks}.rs`（5.2 已完成） |
| `lib.rs`：开机自启、注册表读取 | `system/startup.rs`（5.3 已完成；底层注册表调用在 6.1 放 `win32/registry.rs`）；共用的 `CREATE_NO_WINDOW`、`windows_home_dir` 在 `system/mod.rs` |
| `lib.rs`：`get_updater_proxy`、`updater_configured` | `system/updater.rs` |
| `lib.rs`：`save_todo_markdown`、默认保存目录 | `system/todo_export.rs` |
| （新增）游戏模式的全屏程序检测 | `system/fullscreen.rs`（每 800ms 轮询，底层调用在 `win32/notification_state.rs`） |
| `lib.rs`：`tests` 模块（窗口几何、更新配置等） | 窗口几何测试 → `island/tests.rs`（5.1），更新配置测试 → `system/updater.rs` 内联测试（5.3） |
| `qq_mail.rs` | `qq_mail/{mod, service, session, content, credentials, tests}.rs`（5.4 已完成） |
| `qq_notifications.rs` | `qq_notifications/{mod, listener, history, launcher, tests}.rs`（5.5 已完成；`launcher.rs` 负责查找并激活 QQ 窗口） |
| `clipboard_history.rs` | `clipboard_history/{mod, service, store, hotkey}.rs`（5.6 已完成） |
| `media_control.rs`、`lib.rs` 中的媒体命令 | `media_control/{mod, service, session, audio}.rs`（5.7 已完成：命令在 `mod.rs`，内部入口与状态类型在 `service.rs`） |
| `wechat_reminders.rs` + `wechat_reminder_source.rs` | `wechat_reminders/{mod, source, tests}.rs`（5.8 已完成） |
| 各模块中的 `unsafe` Win32 / COM 调用 | `win32/` 安全封装（6.1–6.3 已完成：`window`、`message_window`、`hotkey`、`clipboard`、`shell_hook`、`input`、`com`、`audio`、`ole`、`process`、`process_times`、`registry`、`notification_state`；生产代码中 `win32/` 以外没有 `unsafe`） |

## 对外契约清单

纯重构中下列标识不得改变，规则见根目录 [AGENTS.md](../../AGENTS.md#对外契约不得随意变更)。新增契约时同步更新本节。

### localStorage key

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
| `focusd-island-qq-mail-settings` | `features/messages/qq-mail/storage.ts` |
| `focusd-island-qq-mail-remote-images` | `features/messages/qq-mail/storage.ts` |
| `focusd-island-qq-notifications-enabled` | `features/messages/qq-notifications/storage.ts` |
| `focusd-island-qq-notification-access-requested` | `features/messages/qq-notifications/storage.ts` |
| `focusd-island-wechat-reminders-enabled` | `features/messages/wechat/storage.ts` |
| `focusd-island-translation-settings` | `features/translation/storage.ts` |
| `focusd-island-translation-handoff`（主窗口 → 翻译窗口：选中文字的快捷翻译结果 `{ source, output, requestedAt, openRequestedAt }`；点击岛上那一行后 5 秒内打开才会带入，结果超过 60 秒忽略） | `features/translation/storage.ts` |
| `focusd-island-locale` | `i18n/index.ts` |
| `focusd-island-plugin-pages`（`{ order, hidden }`：岛上插件页面的顺序和隐藏的页面，值为页面 id `plugin:<插件 id>/<view id>`；设置窗口写，主窗口通过 `storage` 事件跟随） | `features/plugin-views/storage.ts` |

### 事件

| 事件名 | 发送方 | 目标 |
|---|---|---|
| `island-position-changed` | `island/mod.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-top-attachment-changed`（载荷为 `bool`：岛屿是否贴住所在显示器顶边） | `island/top_edge.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-hover-changed`（载荷为 `bool`：光标是否在岛屿形状内，供悬停展开使用） | `island/passthrough.rs` | 广播（通过主窗口对象调用 `emit`） |
| `foreground-fullscreen-changed`（载荷为 `{ active, onIslandMonitor }`：前台是否有全屏程序、是否占住岛所在的显示器，供游戏模式使用） | `system/fullscreen.rs` | 广播 |
| `clipboard-history-changed` | `clipboard_history/service.rs`（常量在 `mod.rs`） | 广播 |
| `clipboard-history-shortcut` | `clipboard_history/service.rs`（常量在 `hotkey.rs`） | 广播 |
| `clipboard-history-shortcut-status`（载荷为字符串或 `null`：剪贴板快捷键注册失败的原因，成功或关闭时为 `null`；最近一次结果也可用 `get_clipboard_shortcut_error` 读取） | `clipboard_history/hotkey.rs` | 广播 |
| `qq-mail-changed` | `qq_mail/service.rs`（常量在 `mod.rs`） | 广播 |
| `qq-notifications-changed` | `qq_notifications/mod.rs` | `main`、`settings` |
| `wechat-reminder-changed` | `wechat_reminders/mod.rs` | `main`、`settings` |
| `translation-window-opened` | `translation/mod.rs` | 广播 |
| `translation-selection`（载荷为 `string`：「翻译选中文字」快捷键取到的文字，没有可译内容时为空字符串） | `translation/mod.rs` | 广播 |
| `translation-island-shortcut`（翻译设为「岛内页面」时按下翻译快捷键：先唤出主窗口，再让它切换翻译页） | `translation/mod.rs` | 广播 |
| `local-api-request`（载荷 `{ id, method, params }`，前端用 `answer_local_api_request` 回复） | `local_api/bridge.rs` | `main` |
| `plugin-host-event`（载荷 `{ name, payload }`：插件可订阅的变化，由 Rust 合并后转给订阅的插件；`name` 见 `plugins/schema/rpc.json` 的 `events`） | 主窗口 `windows/island/usePluginHostEvents.ts` | Rust（`plugin_host/events.rs`） |
| `plugin-notification`（载荷 `{ pluginId, pluginName, title, body, durationMs, actions }`：插件的 `island.notify`，按钮用 `run_plugin_notification_action` 回复） | `plugin_host/notify.rs` | `main` |
| `plugin-keybinding`（载荷 `{ pluginId, command, when }`：插件命令的全局快捷键被按下，主窗口求值 `when` 后用 `run_plugin_command` 执行） | `plugin_host/keybindings.rs` | `main` |
| `todos-changed`（载荷 `{ revision, data, fields, reason }`：插件或本地接口改了 `todos.json`，主窗口只采纳 `fields` 列出的字段） | `todos/service.rs` | `main` |
| `plugin-permission-request`（载荷 `{ requestId, pluginId, pluginName, permission, timeoutMs }`：插件第一次使用敏感权限，主窗口显示确认，用 `answer_plugin_permission` 回复） | `plugin_host/sensitive.rs` | `main` |
| `file-shelf-changed`（无载荷：插件改了文件中转列表，主窗口重新读取） | `file_shelf/plugin_view.rs` | `main` |
| `plugin-view-changed`（载荷 `{ kind: "view", pluginId, viewId, model }`：可见的插件页面有新模型；`{ kind: "status", pluginId, itemId, status }`：折叠条状态文字变了；`{ kind: "reset", pluginId, status }`：插件进程启动、停止或崩溃。每个页面或状态项每秒最多 10 次） | `plugin_host/views.rs` | `main` |

### 其他

- 窗口 label：`main`、`translation`、`settings`；前端分发参数为 `?window=translation`、`?window=settings`。
- Tauri 命令：以 `lib.rs` 中 `generate_handler!` 列表为准，命令名即 Rust 函数名。
- 应用标识 `com.focusd.island`，凭据服务名 `com.focusd.island.qq-mail`、`com.focusd.island.translation`。
- 注册表值：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 下的 `FocuSD Island`。
- Hook 受管区块标记：`# BEGIN/END FocuSD Agent Status Hooks`，命令签名前缀 `focusd-agent-`。
- 更新端点与 `latest.json` 格式：见 `tauri.conf.json` 和 `docs/updater.md`。
- 插件市场：索引地址 `https://raw.githubusercontent.com/TixXin/fly-island/main/plugins/index.json`（fork 仓库的 `main` 分支；2026-11-05 之前的版本读 `dev`，推送时 `dev` 与 `main` 保持同一提交）、`index.json` 格式（`version: 1`）与 `plugins/packages/<id>-<version>.zip` 文件名；已发布的版本不得修改内容。索引签名 `index.json.sig`（`{ keyId, signature }`，Ed25519）与可信公钥列表 `plugins/signing-keys.json`；签名私钥在 `~/.tauri/fly-island/plugin-index-signing.key`（DPAPI），不在仓库中。插件平台 P11（2026-11-05）新增：`index.json.sig` 也可以是 `{ keyId, signature }` 的数组（任一可信签名即通过）；撤销名单 `plugins/revoked.json`（`version: 1`，条目 `{ id, versions: "*" | [...], reason, action: "disable" | "uninstall" }`）与 `revoked.json.sig`，与索引从同一提交读取，不存在时视为空；索引条目字段 `publisher`、`repo`、`categories`、`preRelease`（源头是 `plugins/market/<id>.json`，没有 `publisher` 时为官方发布者 `TixXin`）；`plugins.json` 字段 `revoked`、`trustedPublishers`、`autoUpdate`；`PluginInfo.revoked` / `updateAvailable` / `autoUpdated`、`PluginsSnapshot.autoUpdate` / `trustedPublishers`、`MarketPlugin.publisher` / `repo` / `categories` / `revoked`、`MarketSnapshot.trustedPublishers` / `officialPublisher`；Tauri 命令 `set_plugin_auto_update`、`set_plugin_publisher_trusted`、`check_plugin_updates`。之后新增 Tauri 命令 `get_cached_plugin_market`（本次运行中最近一次通过签名校验的市场，不联网；没有时为 `null`）；从市场安装时复用 10 分钟内读到的索引。全部可省略，旧格式照常接受。
- 插件：`focusd-plugin.json` 清单格式、`plugins.json` 字段、JSON-RPC 方法与通知、错误码、`FOCUSD_PLUGIN_*` 环境变量，见 [docs/plugins/README.md](../plugins/README.md)；机器可读的描述在 `plugins/schema/manifest.schema.json` 与 `plugins/schema/rpc.json`（`plugin_host/tests.rs` 对照检查）。插件 API 第 2 版（2026-11-05）新增：清单 `apiVersion: 2`、`contributes.commands[].keybinding` / `when`、`contributes.menus["todo/context"]`；`initialize.capabilities`；方法 `events.*`、`island.notify`、`storage.*`、`secrets.*`，通知 `event`、`notification.action`，`command` 的 `args`；权限 `agent-status:read`、`island:notify`、`secrets`；`plugins.json` 授权项字段 `notificationsMuted`；文件 `plugins-data/<id>/storage.json` 与 `plugin-secrets.json`（各插件已存秘密的名称）；凭据服务名 `com.focusd.island.plugin.<id>`；Tauri 命令 `run_plugin_notification_action`、`set_plugin_notifications_muted`、`clear_plugin_data`、`list_plugin_menu`、`run_plugin_menu_command`。全部是新增，`apiVersion: 1` 插件的行为不变。插件平台 P6（2026-11-05）新增：权限 `clipboard:read`、`messages:read`、`media:read`、`shelf:read`、`shelf:write`（敏感，首次使用时在岛上确认）与 `media:control`；方法 `clipboard.history`、`messages.list`、`media.nowPlaying`、`media.playPause` / `next` / `previous`、`shelf.list` / `add` / `remove`；事件 `clipboard.changed`、`messages.received`、`media.changed`，`todos.changed` 增加 `reason`；`plugins.json` 授权项字段 `sensitive`（`{ <权限>: "allowed" | "denied" }`）；Tauri 命令 `answer_plugin_permission`、`revoke_plugin_sensitive_permission`。凭据（QQ 邮箱授权码、翻译密钥）不对插件开放。插件平台 P7（2026-11-05）新增：清单 `contributes.views`（`list` / `detail` / `form` / `status` 模板，图标只能用 schema 里列出的 lucide 名称）与 `contributes.statusItems`；方法 `view.update`、`view.patch`、`status.update`，通知 `view.visible`、`view.action`、`view.submit`、`view.search`；`initialize.capabilities` 增加 `views`、`status`；岛上页面 id `plugin:<插件 id>/<view id>`（排在内置页面之后）；Tauri 命令 `list_plugin_views`、`set_plugin_view_visible`、`run_plugin_view_action`、`submit_plugin_view`、`search_plugin_view`、`restart_plugin`。插件只发数据，不发界面代码。插件平台 P9（2026-11-05）新增：清单 `activationEvents`（`onStartup`、`onStartupFinished`、`onCommand:<id>`、`onView:<id>`、`onEvent:<名称>`、`onSchedule:<分钟>`；不写时随岛屿常驻，第 1 版插件忽略）；`initialize.activationEvent`（第 2 版）；方法 `host.keepAlive`；插件状态 `idle`（`PluginStatus` 新增取值）。插件进程树放在 Windows Job Object 中，随插件结束。插件平台 P10（2026-11-05）新增：清单 `experimentalApis`（只有开发模式加载的插件能用，插件目录里的插件写了它就无法使用）；`initialize.experimentalApis`；本地接口 `POST /v1/dev/plugins`、`POST /v1/dev/plugins/{id}/reload`、`DELETE /v1/dev/plugins/{id}`、`GET /v1/dev/plugins/{id}/log`（只在开发模式打开时可用）；`PluginInfo.dev`；Tauri 命令 `get_plugin_dev_state`、`set_plugin_dev_mode`、`load_dev_plugin`、`reload_dev_plugin`、`unload_dev_plugin`、`get_plugin_rpc_trace`、`send_plugin_dev_event`。开发模式只在内存中，不写入 `plugins.json`。npm 包 `fly-island-plugin`、`create-fly-island-plugin` 与 PowerShell 模块 `FlyIsland.Plugin` 的源码在 `packages/`，`plugins/sdk/` 的单文件 SDK 和 `docs/plugins/api.md` 由 `pnpm sdk:build` 生成。
- 待办数据（P6，2026-11-05 起，**数据位置的契约变更**）：`todos.json`（`{ version: 1, revision, migration?, date, todos, scheduled, archives, dailyNote, activeTodoId }`，字段形状与原 localStorage 一致）及上面列出的备份文件；Tauri 命令 `migrate_todos`、`get_todos_state`、`apply_todos_change`（`baseRevision` 之后被插件或本地接口改过的字段不会被覆盖）；事件 `todos-changed`。待办数据在 `todos.json` 时，插件和本地接口的 `todos.*` / `note.*` 由 Rust 直接读写；迁移失败、退回 localStorage 的那次运行仍经 `local-api-request` 由主窗口回答，所以该事件保留。
- 本地接口：首选端口 `39271`、`/v1/` 下的路径与 JSON 格式、`local-api.json` 字段，见 [docs/local-api.md](../local-api.md)。自 2026-11-04 起它是内置插件 `focusd.local-api`（插件 id 与设置键 `allowWrite` 也属于契约），命令 `get_local_api_state`、`set_local_api_settings`、`reset_local_api_token` 已删除。
