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
│           mail · qq_notifications · wechat_reminders · translation · settings_window │
│  后台服务：IMAP IDLE 收信、剪贴板监听、通知监听、微信提醒与摘要、鼠标穿透循环          │
└────────────┬─────────────────────────────────────────────────────────────────────────┘
             ▼
   Windows：Win32 / WinRT（SMTC 媒体、音频端点、通知监听、注册表、窗口）、凭据管理器
```

各项数据存在哪里见 [data-storage.md](data-storage.md)。

Agent 的 DSH 桌面端来源由 `agent_status/dsh_sessions.rs`（只读本地检查点、合并去重、宿主聚焦）、dsh_desktop.rs（官方与社区宿主识别、目录发现）、`dsh_credentials.rs`（受限凭据读取）和 `dsh_usage.rs`（官方余额只读查询与内存缓存）承担；从现有会话命令和聚焦命令接入，余额有独立的 `get_dsh_usage` 命令。前端仍在 `features/agent-status/`，余额展示在 `DshQuotaRing.tsx`，纯逻辑在 `dshUsage.ts`。详见 [DSH 接入说明](../deepseek-harness.md)。

微信摘要开启时，微信提醒服务通过 `win32/caption_close.rs` 将微信关闭按钮的点击转为最小化，通过 `win32/taskbar.rs` 控制最小化窗口的任务栏按钮。

## 目标结构

前端和 Rust 的目标目录树，以及各目录的职责，分别见 [src/AGENTS.md](../../src/AGENTS.md#目标结构) 和 [src-tauri/AGENTS.md](../../src-tauri/AGENTS.md#目标结构)。本文只记录迁移映射。

### 前端依赖方向

```text
main.tsx → windows/ → features/ → components/、lib/、utils/、i18n/、styles/
```

## 其他文档

- [data-storage.md](data-storage.md)：每项数据存在哪里、由哪个模块负责
- [contracts.md](contracts.md)：对外契约清单（localStorage key、事件、命令与文件格式）
- [migration-map.md](migration-map.md)：结构重构时旧文件到新位置的对照

## 媒体诊断与本地校准

`media_control/diagnostics.rs` 只读枚举 SMTC 会话及已知播放器进程，复用 `timeline.rs` 的可信时间戳判断和 `win32/process*.rs` 的安全进程查询，文件版本读取封装在 `win32/file_version.rs`。前端 `useMediaDiagnostics.ts` 按打开面板、切换播放器与媒体事件触发五秒节流刷新，独立于媒体轮询；`MediaDiagnosticsCard` 和 `MediaCompatibilitySection` 分别显示面板提示及设置行。无时间线的歌词点击通过 `useMediaState.calibrate` 校准 `trackClock`，不改变播放器状态与 `positionAnchor`。
- `src-tauri/src/media_plugins/`：网易云精准进度插件的只读探测、固定版本下载校验、显式安装 / 卸载与安装记录；受限提权调用封装在 `win32/media_plugin_elevation.rs`，注册表探测封装在 `win32/media_plugin_registry.rs`。
