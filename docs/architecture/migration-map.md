# 迁移映射

重构（Phase 0–6）时旧文件到新位置的对照，见 [refactor-plan.md](refactor-plan.md)。

## 迁移映射：前端

以下是初版映射，具体归属在执行对应步骤时根据代码再确认。如有调整，在本表中更新。

| 现有位置 | 目标位置 |
|---|---|
| `App.tsx`：`App`、`IslandApp`、`IslandShell` | `windows/island/IslandApp.tsx`（`App` 包装已去掉，`main.tsx` 直接渲染 `IslandApp`）、`IslandShell.tsx`；外壳拆出 `IslandCollapsedBar.tsx`、`IslandHeader.tsx` 与 `useGlassPointer.ts`、`useIslandPreparing.ts`、`useWindowDragGesture.ts`。展开后各页面的面板在 `IslandPages.tsx`。`IslandApp` 的导航、快捷键、折叠态待办摘要、展开高度、舞台样式分别在 `useIslandNavigation.ts`、`useIslandKeyboard.ts`、`useCollapsedTodo.ts`、`expandedHeight.ts`、`stageStyle.ts`；外观设置的持久化与同步在 `features/appearance/useIslandSettings.ts` |
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
| `QQMail.tsx/.css` | `features/messages/mail/` |
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
| `qq_mail.rs` | `mail/{mod, accounts, supervisor, service, session, client_id, content, credentials, plugin_view, tests}.rs`（5.4 已完成；目录由 qq_mail/ 改名为 mail/） |
| `qq_notifications.rs` | `qq_notifications/{mod, listener, history, launcher, tests}.rs`（5.5 已完成；`launcher.rs` 负责查找并激活 QQ 窗口） |
| `clipboard_history.rs` | `clipboard_history/{mod, service, store, hotkey}.rs`（5.6 已完成） |
| `media_control.rs`、`lib.rs` 中的媒体命令 | `media_control/{mod, service, session, audio}.rs`（5.7 已完成：命令在 `mod.rs`，内部入口与状态类型在 `service.rs`） |
| `wechat_reminders.rs` + `wechat_reminder_source.rs` | `wechat_reminders/{mod, source, tests}.rs`（5.8 已完成） |
| 各模块中的 `unsafe` Win32 / COM 调用 | `win32/` 安全封装（6.1–6.3 已完成：`window`、`message_window`、`hotkey`、`clipboard`、`shell_hook`、`input`、`com`、`audio`、`ole`、`process`、`process_times`、`registry`、`notification_state`、`webview_page`（P8 插件页面）；生产代码中 `win32/` 以外没有 `unsafe`） |
