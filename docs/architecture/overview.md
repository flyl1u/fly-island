# 架构总览

本文描述 FocuSD Island 的运行时架构、目标代码结构、从现有文件到目标位置的迁移映射，以及对外契约清单。编码规则见 [AGENTS.md](../../AGENTS.md)、[src/AGENTS.md](../../src/AGENTS.md) 和 [src-tauri/AGENTS.md](../../src-tauri/AGENTS.md)，迁移步骤见 [refactor-plan.md](refactor-plan.md)。

## 运行时架构

```text
┌──────────────────────── WebView2（同一前端包，按 ?window= 分发）────────────────────────┐
│  main：悬浮岛            translation：快捷翻译            settings：设置（按需创建）       │
└────────────┬─────────────────────────────────────────────────────────────────────────┘
             │ invoke（命令，请求/响应）        ▲ emit / emit_to（事件，后端主动推送）
             ▼                                │
┌──────────────────────────────── Rust（Tauri 2）──────────────────────────────────────┐
│  lib.rs 组装：插件 / setup / 托盘 / generate_handler!                                  │
│  领域模块：island · agent_status · system · clipboard_history · media_control          │
│           qq_mail · qq_notifications · wechat_reminders · translation · settings_window │
│  后台服务：IMAP IDLE 收信、剪贴板监听、通知监听、微信窗口闪烁检测、鼠标穿透循环        │
└────────────┬─────────────────────────────────────────────────────────────────────────┘
             ▼
   Windows：Win32 / WinRT（SMTC 媒体、音频端点、通知监听、注册表、窗口）、凭据管理器
```

### 数据存放位置

| 数据 | 位置 | 负责方 |
|---|---|---|
| 设置、预设、待办、笔记、归档、各功能开关、语言 | WebView2 的 `localStorage` | 前端各 feature 的 `storage.ts` |
| AI 代理状态与运行标记、hook 脚本 | 应用数据目录（`agent-status.json`、`agent-*-running*.flag`、`focusd-agent-*.{cmd,ps1}`） | `agent_status` |
| Codex / Claude Code hook 配置 | `~/.codex/config.toml`、`~/.claude/settings.json` 中带标记的受管区块 | `agent_status` |
| QQ 邮箱授权码、翻译 API 密钥 | Windows 凭据管理器（`com.focusd.island.qq-mail`、`com.focusd.island.translation`） | `qq_mail`、`translation` |
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
| `App.tsx`：`App`、`IslandApp`、`IslandShell` | `windows/island/IslandApp.tsx`、`IslandShell.tsx` |
| `App.tsx`：窗口尺寸、展开高度、拖拽、位置、贴边相关的 state 与 effect | `windows/island/useIslandWindow.ts`、`windows/island/api.ts`（`windows/island/` 已建立：`topEdge.ts` 把原生顶边贴合状态写到根元素 `data-island-top-edge`，`IslandTopEdge.css` 据此绘制平顶与反向圆角；迁入 `useIslandWindow` 时可改为 prop） |
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
| `App.css` | 拆分到各组件的同名 `.css`，全局部分放到 `styles/tokens.css`、`base.css`、`fonts.css` |
| `Messages.tsx/.css`、`MessageSourceIcon.tsx`、`CollapsedMessageContent.tsx/.css`、`messagePreview.ts`、`qqNotificationTiming.ts` | `features/messages/` |
| `QQMail.tsx/.css` | `features/messages/qq-mail/` |
| `QQNotifications.tsx/.css` | `features/messages/qq-notifications/` |
| `WeChatReminders.tsx/.css` | `features/messages/wechat/` |
| `UpdatePanel.tsx/.css`、`updaterController.ts` | `features/updater/` |
| `useIslandAutomation.ts` | `windows/island/useIslandAutomation.ts` |
| `SettingsWindow.tsx/.css` | `windows/settings/` |
| `TranslationWindow.tsx/.css` | `windows/translation/` |
| `utils/text.ts`、`i18n/`、`assets/` | 保持不动 |

## 迁移映射：Rust

| 现有位置 | 目标位置 |
|---|---|
| `lib.rs`：`run()`、插件、setup、`generate_handler!` | 保留在 `lib.rs` |
| `lib.rs`：托盘创建与事件 | `tray.rs` |
| `lib.rs`：`IslandWindowState`、布局/交互/拖拽/位置命令、几何计算、毛玻璃、鼠标穿透、动画 | `island/{mod, state, geometry, glass, passthrough}.rs`（`island/` 已建立：`top_edge.rs` 负责顶边贴合判断与拖放吸附，`mod.rs` 放 `get_island_top_attachment` 命令） |
| `lib.rs`：代理状态快照、运行标记、Codex / Claude Code hook 安装 | `agent_status/{mod, snapshot, markers, codex_hooks, claude_hooks}.rs` |
| `lib.rs`：开机自启、注册表读取 | `system/startup.rs`（底层注册表调用放 `win32/registry.rs`） |
| `lib.rs`：`get_updater_proxy`、`updater_configured` | `system/updater.rs` |
| `lib.rs`：`save_todo_markdown`、默认保存目录、`write_text_file` | `system/todo_export.rs` |
| `lib.rs`：`tests` 模块（窗口几何、更新配置等） | 随上述代码分到各自的 `tests.rs` |
| `qq_mail.rs` | `qq_mail/{mod, service, session, content, credentials, tests}.rs` |
| `qq_notifications.rs` | `qq_notifications/{mod, listener, history, tests}.rs`（以实际职责为准） |
| `clipboard_history.rs` | `clipboard_history/{mod, service, store, hotkey}.rs`（以实际职责为准） |
| `media_control.rs` | `media_control/{mod, session, audio}.rs` |
| `wechat_reminders.rs` + `wechat_reminder_source.rs` | `wechat_reminders/{mod, source, tests}.rs` |
| 各模块中的 `unsafe` Win32 / COM 调用 | `win32/` 安全封装 |

## 对外契约清单

纯重构中下列标识不得改变，规则见根目录 [AGENTS.md](../../AGENTS.md#对外契约不得随意变更)。新增契约时同步更新本节。

### localStorage key

| key | 当前定义位置 |
|---|---|
| `focusd-island-settings` | `features/appearance/storage.ts` |
| `focusd-island-collapsed-text-default-v1`（迁移标记） | `features/appearance/storage.ts` |
| `focusd-island-setting-presets` | `features/appearance/storage.ts` |
| `focusd-island-todos` | `features/todos/storage.ts` |
| `focusd-island-active-todo` | `features/todos/storage.ts` |
| `focusd-island-current-date` | `features/todos/storage.ts` |
| `focusd-island-archives` | `features/todos/storage.ts` |
| `focusd-island-daily-note` | `features/todos/storage.ts` |
| `focusd-island-save-directory` | `features/todos/storage.ts` |
| `focusd-island-last-saved-signature` | `features/todos/storage.ts` |
| `focusd-island-position` | `App.tsx` |
| `focusd-island-music-sources` | `features/media/storage.ts` |
| `focusd-island-settings-focus`（主窗口 → 设置窗口的跳转请求） | `App.tsx` |
| `focusd-island-qq-mail-settings` | `QQMail.tsx` |
| `focusd-island-qq-mail-remote-images` | `QQMail.tsx` |
| `focusd-island-qq-notifications-enabled` | `QQNotifications.tsx` |
| `focusd-island-qq-notification-access-requested` | `QQNotifications.tsx` |
| `focusd-island-wechat-reminders-enabled` | `WeChatReminders.tsx` |
| `focusd-island-translation-settings` | `TranslationWindow.tsx` |
| `focusd-island-locale` | `i18n/index.ts` |

### 事件

| 事件名 | 发送方 | 目标 |
|---|---|---|
| `island-position-changed` | `lib.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-top-attachment-changed`（载荷为 `bool`：岛屿是否贴住所在显示器顶边） | `island/top_edge.rs` | 广播（通过主窗口对象调用 `emit`） |
| `clipboard-history-changed` | `clipboard_history.rs` | 广播 |
| `clipboard-history-shortcut` | `clipboard_history.rs` | 广播 |
| `qq-mail-changed` | `qq_mail.rs` | 广播 |
| `qq-notifications-changed` | `qq_notifications.rs` | `main`、`settings` |
| `wechat-reminder-changed` | `wechat_reminders.rs` | `main`、`settings` |
| `translation-window-opened` | `translation.rs` | 广播 |

### 其他

- 窗口 label：`main`、`translation`、`settings`；前端分发参数为 `?window=translation`、`?window=settings`。
- Tauri 命令：以 `lib.rs` 中 `generate_handler!` 列表为准，命令名即 Rust 函数名。
- 应用标识 `com.focusd.island`，凭据服务名 `com.focusd.island.qq-mail`、`com.focusd.island.translation`。
- 注册表值：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 下的 `FocuSD Island`。
- Hook 受管区块标记：`# BEGIN/END FocuSD Agent Status Hooks`，命令签名前缀 `focusd-agent-`。
- 更新端点与 `latest.json` 格式：见 `tauri.conf.json` 和 `docs/updater.md`。
