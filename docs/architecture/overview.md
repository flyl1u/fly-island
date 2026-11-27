# 架构总览

本文描述 Fly Island 的运行时架构、目标代码结构、从现有文件到目标位置的迁移映射，以及对外契约清单。编码规则见 [AGENTS.md](../../AGENTS.md)、[src/AGENTS.md](../../src/AGENTS.md) 和 [src-tauri/AGENTS.md](../../src-tauri/AGENTS.md)，迁移步骤见 [refactor-plan.md](refactor-plan.md)，插件 API v1 架构见 [plugins.md](plugins.md)（进程树清理由 `win32/process_job.rs` 封装）。

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
│           mail · qq_notifications · wechat_reminders · telegram_notifications · translation · settings_window │
│  后台服务：IMAP IDLE 收信、剪贴板监听、通知监听、微信提醒与摘要、鼠标穿透循环          │
└────────────┬─────────────────────────────────────────────────────────────────────────┘
             ▼
   Windows：Win32 / WinRT（SMTC 媒体、音频端点、通知监听、注册表、窗口）、凭据管理器
```

各项数据存在哪里见 [data-storage.md](data-storage.md)。

外观设置选择本机字体时，`features/appearance/api.ts` 经 `system/fonts.rs` 异步调用 `win32/fonts.rs` 枚举已安装字体。字体名称随外观设置保存，主岛和设置预览复用 `features/appearance/localFont.ts` 生成的字体栈。

待办每日 Markdown 的可选反向同步由 `features/todos/todoMarkdownSync.ts` 串行协调（稳定采样、三方合并、防回环），`useTodoFileSync.ts` 负责日期/目录生命周期和低频轮询；Rust `system/todo_sync.rs` 提供受限读取及版本比较写入。默认关闭时仍走原 `todo_export.rs` 单向导出。偏好、恢复副本与数据流见 [data-storage.md](data-storage.md)，命令契约见 [contracts.md](contracts.md)。

配置迁移（issue #87）由前端 `features/config-transfer/` 与原生 `config_transfer/` 负责；Win32 JSON 对话框封装在 `win32/file_dialog.rs`。原生模块在服务初始化前恢复允许的数据文件；所有 WebView 在 React 挂载前等待启动门禁，只有主窗口应用 localStorage 后确认完成。插件、剪贴板与 Agent 集成的可迁移部分由各自 `transfer.rs` 提供，凭据不跨边界；异常保留可重试的备份和文件撤销日志。格式见 [contracts.md](contracts.md)。

产品更名兼容由原生 `legacy_migration/` 与前端 `shared/storage/legacyMigration.ts` 负责。原生迁移在 `tauri::Builder` 前迁移应用数据目录、凭据、自启、Hook 配置和回复标记；前端入口同步迁移 WebView localStorage。普通业务模块只使用新名字。

根目录 `release-features.json` 是前端与 Rust 的发布功能开关单一来源：`plugins`、`mailOtp` 当前关闭；`pluginMarket` 自 3.2.8 起在正式版打开（用户要求 2026-11-19）。`pluginMarket` 只在前端生效：关闭时插件页不显示内置插件市场（钉钉 / 飞书 / 企业微信、Cursor / Kimi Code / Hermes / Z Code、时间与天气），`useNativePlugins` 一律报告未安装，测试版存下的安装记录保留不读；3.2.8-beta 先在测试版开放，3.2.8 起正式版也开放。前端通过 `features/releaseFlags.ts` 读取，`src-tauri/build.rs` 将同一配置转为编译期 cfg，由 `release_flags.rs` 导出常量。关闭时保留旧数据与 IPC 契约，插件宿主不启动进程、请求索引或修改配置，邮箱同步不提取验证码或为此请求正文，复制入口也不运行。每项仅改 JSON 中对应的一个值并重新构建即可恢复。回归运行器分别启动正式配置和开启保留功能的 Vite 测试实例；测试覆盖不通过生产运行时开关实现。

Codex 的会话展示仍由 `agent_status/session_scan.rs` 读取 rollout 尾部；`codex_activity.rs` 在内存中增量保存完整文件的 turn 边界、用户提示时间和最后完成时间，避免长上下文把开始记录挤出尾部。按文件修改时间扫描所有日期目录，兼容旧目录中恢复的会话。前端 `features/agent-status/completion.ts` 统一判定显式完成时间变化，供弹出与声音使用。无新增持久化文件。实测与限制见 [Codex 会话排查记录](../investigations/codex-thinking-sessions-2026-11-15.md)。

Agent 的 DSH 桌面端来源由 `agent_status/dsh_sessions.rs`（只读本地检查点、合并去重、宿主聚焦）、dsh_desktop.rs（官方与社区宿主识别、目录发现）、`dsh_credentials.rs`（受限凭据读取）和 `dsh_usage.rs`（官方余额只读查询与内存缓存）承担；从现有会话命令和聚焦命令接入，余额有独立的 `get_dsh_usage` 命令。前端仍在 `features/agent-status/`，余额展示在 `DshQuotaRing.tsx`，纯逻辑在 `dshUsage.ts`。详见 [DSH 接入说明](../deepseek-harness.md)。

WorkBuddy 桌面端会话由 `agent_status/workbuddy_sessions.rs` 只读解析（本地会话记录与打开中的会话登记，聚焦主窗口），从现有会话命令和聚焦命令接入。WorkBuddy 的 `agent_status/workbuddy_connection.rs` 管理专用 WebView2 官网登录和后台续期，`workbuddy_auth.rs` 决定续期时间与失败退避，`workbuddy_cookie_vault.rs` 保存并恢复凭据副本，`workbuddy_usage.rs` 读取积分汇总。远程登录窗口 `workbuddy-sign-in` 使用独立浏览器配置，由本地设置页启动。岛屿和设置页共享原生余额缓存，额度环按 `agentQuotaSources` 选择。

WorkBuddy 官方授权与账单解析在 `workbuddy_official.rs`，登录任务、缓存与凭据轮换由 `workbuddy_official_flow.rs` 协调；`workbuddy_curl.rs` 只用系统 curl 向固定账单域请求，凭据走 stdin。旧网页登录兼容，不要求迁移现有 Cookie。

Z Code 的 Coding Plan 额度由 `agent_status/zcode_usage.rs` 查询，优先读取 Windows 凭据管理器中的手动 API Key 配置（`zcode_api_key.rs`），未配置时回退到 Z Code 桌面版登录凭据；设置页只拿到 Key 是否存在与掩码。额度缓存在原生内存中，Key 或平台变更时清除。

微信的进程解析、窗口归属和主窗口选择统一在 `wechat_reminders/source.rs`，供打开动作、提醒监听、摘要读取和探测程序复用；需比较完整路径时使用 `win32/process.rs` 的 canonicalize 与归一化回退。微信摘要开启时，微信提醒服务通过 `win32/caption_close.rs` 将微信关闭按钮的点击转为最小化，通过 `win32/taskbar.rs` 控制最小化窗口的任务栏按钮。

Telegram Desktop 使用 Windows 通知时，`telegram_notifications` 通过 WinRT 读取摘要。用户点击后，服务从当前用户的系统通知数据库只读查询该条通知的激活参数，并交给 Telegram 的原生通知回调。目标失效或激活失败时保留仍可见的卡片，并显示错误。

## 目标结构

前端和 Rust 的目标目录树，以及各目录的职责，分别见 [src/AGENTS.md](../../src/AGENTS.md#目标结构) 和 [src-tauri/AGENTS.md](../../src-tauri/AGENTS.md#目标结构)。本文只记录迁移映射。

外观颜色逻辑位于 `features/appearance/`：`HexColorInput` / `hexColor.ts` 处理输入，`colorPalette.ts` 校验三色，`colorRefresh.ts` 编排一次性刷新，`colorPresets.ts` 处理预设去重与上限，`ColorPresetRow` 呈现芯片；所有备份、迁移标记和预设读写仍收口在同目录 `storage.ts`，复用 `lib/storage.ts` 的安全读写。

### 前端依赖方向

```text
main.tsx → windows/ → features/ → components/、lib/、utils/、i18n/、styles/
```

## 其他文档

- [data-storage.md](data-storage.md)：每项数据存在哪里、由哪个模块负责
- [contracts.md](contracts.md)：对外契约清单（localStorage key、事件、命令与文件格式）
- [migration-map.md](migration-map.md)：结构重构时旧文件到新位置的对照

## 媒体诊断与本地校准

应用诊断由 `app_log` 的有界单写入线程收口；前端 `features/diagnostics/api.ts` 仅传白名单字段，Win32 探测保持在安全封装内。覆盖面、隐私和 ZIP 结构见 [诊断日志](../investigations/diagnostic-log.md)。

`media_control/hotkeys.rs` 独立持有音乐全局快捷键的消息窗口，复用剪贴板组合键解析、`win32/hotkey` 注册与媒体 worker；前端 `features/media/useMusicShortcuts.ts` 在主窗口媒体 hook 中同步 localStorage，设置页只编辑与读取状态。快捷键冲突由设置窗口组合各领域配置，审批键始终预留。

歌词源位于 `lyrics/`：QQ 专属接口与 QRC 解密（`qqmusic.rs` / `qrc_cipher.rs`）、酷狗原生缓存（`kugou_cache.rs`）、汽水只读 LMDB 快照和 msgpackr 解码（`soda_cache.rs` / `soda_lmdb.rs` / `soda_msgpack.rs`）、网易 YRC 与共享逐字格式转换（`word_formats.rs`），统一输出增强 LRC。来源顺序、兼容缓存与限制见 [歌词源说明](../lyrics-sources.md)。

`media_control/diagnostics.rs` 只读枚举 SMTC 会话及已知播放器进程，复用 `timeline.rs` 的可信时间戳判断和 `win32/process*.rs` 的安全进程查询，文件版本读取封装在 `win32/file_version.rs`。前端 `useMediaDiagnostics.ts` 按打开面板、切换播放器与媒体事件触发五秒节流刷新，独立于媒体轮询；`MediaDiagnosticsCard` 和 `MediaCompatibilitySection` 分别显示面板提示及设置行。无时间线的歌词点击通过 `useMediaState.calibrate` 校准 `trackClock`，不改变播放器状态与 `positionAnchor`。
- `src-tauri/src/media_plugins/`：网易云精准进度插件的只读探测、固定版本下载校验、显式安装 / 卸载与安装记录；受限提权调用封装在 `win32/media_plugin_elevation.rs`，注册表探测封装在 `win32/media_plugin_registry.rs`。

## 时间与天气及排列预览（2026-11-19）

插件设置放在哪一页由插件目录（`features/plugins/native/catalog.ts` 的 `settings`）声明，`features/plugins/placement.ts` 算出已启用插件的栏目与分组，设置面板、侧栏和插件卡片只读这份结果。内置插件 `clockWeather` 通过 `features/plugins/native` 的安装态启用，并声明独立的时间与天气设置页。`features/weather/` 收口城市与缓存存储、IPC、WMO 纯映射及时间/天气叶子组件；`src-tauri/src/weather/` 封装 Open-Meteo 请求。主窗口 `useCollapsedTodo` 低频预留状态位宽度，自动长度时 `useCollapsedChrome` 测量收起栏里文字以外的部分（状态位、留白、间距），`collapsedTextMeasure` 用画布按收起栏字体量文字，宽度本身由纯函数 `collapsedWidth.ts` 计算。时间的分钟状态留在叶子中，不驱动窗口重渲染。数据与契约见对应文档。

喝水提醒内置插件声明独立设置页。`features/water-reminder/` 管理定时、文案和用户偏好，`useIslandNotices` 协调提醒和消息预览。

排列编辑器和 `IslandPreview` 共享 `features/appearance/islandPreviewStyle.ts` 的外观变量。通用排序 hook 的 FLIP/指针跟随为可选参数，仅编辑器启用；页面入口与其它调用者保持原有交互。
### 护眼休息窗口（插件 0.2.0）

`plugins/eye-care` 只负责单调时钟、空闲/全屏查询与休息动作；`plugin_host/service` 将已启用插件的有界快照转交 `src-tauri/src/eye_care`。该模块按需创建 `eye-care-rest-*`，页面入口 `?window=eye-care`，组合位于 `src/windows/eye-care`，UI 位于 `src/features/eye-care`。旧 GDI 按钮、遮罩及进程发现不再使用。`win32/eye_care.rs` 只约束这些窗口自身的层级；现有窗口标识与置顶设置保持兼容。


市场插件日历标记由 features/todos/calendar-marks 提供。设备电量的界面和绑定在 features/device-battery，原生读取在 src-tauri/src/device_battery，仅执行宿主管理的市场包。MiniMax Code 的只读会话与额度、可选审批接入位于 plugins/minimax。

倒计时显示：`components/countdown/Countdown.tsx` 与护眼休息面板复用 `lib/useCountdown.ts`，剩余秒数、下一刷新边界与格式化由 `utils/countdown.ts` 计算。按绝对截止时间刷新，隐藏时停止定时，恢复可见时校准；不新增后台 IPC 或持久化。
