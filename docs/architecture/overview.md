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
