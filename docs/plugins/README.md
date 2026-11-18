# 插件开发规范 / Plugin development guide

**插件功能即将上线，欢迎先按本规范开发并提交 PR。** 当前正式版本保持 `release-features.json` 的 `plugins: false`：设置 → 插件仅提供开发计划和本规范链接，不提供安装、启用、本地加载等功能。本地源码调试须按[快速开始](quickstart.md)临时启用开发构建，不能仅打开开发者模式。

**Plugins are coming soon. Start building with this guide and submit a PR.** Production keeps `plugins: false` in `release-features.json`. Settings → Plugins offers the development plan and this guide; installation, enabling and directory loading remain unavailable. Follow the [quickstart](quickstart.md) to enable a local development build; developer mode alone cannot override the release flag.

## 从这里开始 / Start here

| 文档 / Document | 内容 / Contents |
| --- | --- |
| [快速开始 / Quickstart](quickstart.md) | 构建示例、协议探测、目录加载、本地索引、调试 / Build the example, probe RPC, load a directory, test a local index and debug |
| [开发规范 / Specification](specification.md) | 目录、manifest 全字段、兼容性、权限、安全、资源与分发 / Layout, every manifest field, compatibility, permissions, security, resources and distribution |
| [API v1](api.md) | JSON-RPC、全部扩展点与数据结构、SDK / JSON-RPC, all extension points and data structures, SDK |
| [设计融入指南 / Design integration](design.md) | 原生组件、文案、图标、额度、会话、消息与免打扰 / Host components, copy, icons, quota, sessions, messages and quiet behavior |
| [提交与审核 / Contribution and review](contributing.md) | 必填材料、自测、录屏、审核标准与发布 / Required evidence, tests, recordings, review criteria and publishing |
| [宿主架构 / Host architecture](../architecture/plugins.md) | 宿主内部模块与职责 / Host internals and responsibilities |

开发 → 在真实小岛中调试和录屏 → [按模板提 PR](../../.github/PULL_REQUEST_TEMPLATE/plugin.md) → **flyl1u 审核、合并并统一发布**。PR 必须提供嵌入小岛后实际运行的录屏演示链接、作者、联系方式、GitHub 链接、功能、权限、联网域名与自测步骤。

Develop → test and record the plugin inside the real island → [submit a PR using the template](../../.github/PULL_REQUEST_TEMPLATE/plugin.md) → **flyl1u reviews, merges and publishes**. The PR must include a recording link showing the plugin running inside the island, author, contact information, GitHub link, functionality, permissions, network domains and self-test steps.

## 插件的边界 / What a plugin is

插件是按需安装的 Windows 独立可执行进程，通过 stdin/stdout JSON-RPC 提供额度、会话、消息和用户动作。主程序不编译链接插件 crate，也不在安装包中捆绑这些插件。显示界面由小岛的 React 原生组件统一呈现；这里的「原生」指宿主现有组件，不是插件创建的系统窗口。

A plugin is an optional Windows executable communicating over stdin/stdout JSON-RPC. It supplies quota, sessions, messages and user actions. Plugin crates are neither linked into the host nor bundled with its installer. “Native” presentation means the island's existing React components, not plugin-owned system windows.

- 可以 / Supported: 显示剩余额度或余额、接入本地 Agent 会话、提供消息摘要、在用户点击时打开对应会话或启动已声明的登录动作。/ Show remaining quota or balance, local agent sessions and message summaries; open a session or start a declared sign-in action on a user click.
- 不可以 / Unsupported: HTML、CSS、JS 注入、Webview、自定义面板、任意宿主方法调用、在岛上审批工具执行或读取所有内置数据；v1 仅有文档列出的三个扩展点。/ No HTML, CSS, JS injection, Webview, custom panels, arbitrary host calls, tool-approval integration or access to all built-in data; v1 has only the three documented contribution types.
- 插件以当前用户权限运行，权限是审核声明，**不是操作系统沙箱或网络防火墙**。新增能力先讨论 API，不在插件里绕过宿主。/ Plugins run as the current user. Permissions are review declarations, **not an OS sandbox or network firewall**. Propose an API change for new capabilities instead of bypassing the host.

启用插件的开发构建中：新安装默认停用；额度进入 Agent 顶部，会话进入原会话列表，消息进入插件分页与折叠预览。停用结束进程并清空内存快照；卸载清除注册、设置及 manifest 声明的 secret 凭据。开发目录卸载只解除注册，不删源码。正式功能关闭时不启动插件，不读取或覆盖此前保存的插件配置。

In a plugin-enabled development build, new installs start disabled. Quota appears above agent sessions, sessions join the existing list, and messages use the plugin tab and collapsed preview. Disabling stops the process and clears its live snapshot. Uninstalling removes registration, settings and manifest-declared secret credentials. Unregistering a development directory preserves its source. A production build with plugins disabled does not start plugins or read/overwrite their saved configuration.

## 仓库内参考实现 / Reference implementations

这些源码位于 `plugins/<id>/`，供开发与审核参考；下表不表示当前正式版已开放下载。

Sources live in `plugins/<id>/` for development and review. This table does not imply downloads are enabled in the current production release.

| 插件 / Plugin | 用途 / Purpose | 固定联网域名 / Fixed network domains |
| --- | --- | --- |
| `example-hello` | 三个扩展点的协议演示，含模拟数据 / Protocol demo with synthetic data for all three extensions | 无 / None |
| `kimi` | Kimi Code 额度与本地会话 / Quota and local sessions | `api.kimi.com` |
| `grok-bot` | Grok Bot 周额度 / Weekly quota | `api2.cursor.sh`（该客户端使用的额度接口 / endpoint used by this client） |
| `gemini` | Code Assist 额度、CLI 会话、OAuth / Quota, CLI sessions and OAuth | `oauth2.googleapis.com`, `cloudcode-pa.googleapis.com` |
| `zcode` | 编程套餐与体验额度 / Coding-plan and trial quota | `api.z.ai`, `bigmodel.cn`, `zcode.z.ai` |
| `doubao` | 会员额度、本地凭据或独立登录 / Membership quota, local credentials or private sign-in | `www.doubao.com`；用户登录可能跳转认证方 / user sign-in may navigate to identity providers |
| `hermes` | BYOK Agent 本地会话 / Local sessions for a BYOK agent | 无 / None |
| `office-im` | 企业微信、飞书、钉钉闪动提醒与前台唤起 / Enterprise IM attention and window activation | 无 / None |

豆包登录只保存 `doubao.com` 及其子域 Cookie 到 Windows 凭据管理器，不收集认证方 Cookie。Gemini 使用 OAuth 凭据，不接管 Chrome 调试端口。这些适配不是要求每个插件都读取凭据；只申请实际需要的权限。

Doubao sign-in stores only `doubao.com` and subdomain cookies in Windows Credential Manager, never identity-provider cookies. Gemini uses OAuth credentials without taking over Chrome debugging ports. These adapters do not require every plugin to read credentials; declare only what yours needs.

## 规范依据 / Source of truth

本文对应仓库当前 API v1；代码强制限制与贡献审核要求分别标明。核对依据：[manifest](../../src-tauri/src/plugin_host/manifest.rs)、[protocol](../../src-tauri/src/plugin_host/protocol.rs)、[进程 / process](../../src-tauri/src/plugin_host/process.rs)、[服务 / service](../../src-tauri/src/plugin_host/service.rs)、[SDK](../../plugins/sdk/src/lib.rs) 与[前端适配 / frontend adapters](../../src/features/plugins/)。发现不一致请附最小复现，更新规范时同时核对实现。

This guide describes the repository's current API v1 and distinguishes enforced limits from review requirements. The linked implementation is the source of truth. Report discrepancies with a minimal reproduction, and check implementation whenever updating the specification.
