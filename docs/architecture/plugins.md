# 插件宿主（外部数据接入）

注意：「插件」在产品上指对小岛源码的改造，PR 合并后由维护者适配成按需安装（见 [插件开发规范](../plugins/README.md)）。本文的插件宿主是其中一种已有机制：用独立进程把外部数据（额度、会话、消息）接进小岛。

API v1 已实现为独立进程平台，协议见 [API](../plugins/api.md)。没有动态库、脚本解释器或 Webview 插件。

`plugin_host/manifest.rs` 校验清单；`protocol.rs` 校验快照；`packages.rs` 下载 / 哈希 / 受限 zip；`storage.rs` 安装状态与凭据；`process.rs` stdio 握手、请求超时和有限重启；`service.rs` 管理进程、安装事务与快照；`mod.rs` 只组装 Tauri 命令。已安装插件由各自进程执行，主程序不依赖插件 crate。

`win32/process_job.rs` 以 kill-on-close Job Object 管理插件及其子进程；正常停止先发可选 `shutdown`，最多等待 3 秒，再结束进程树。旧 v1 插件不实现 shutdown 仍可被停止。SDK 的输入和输出均限制为 256 KiB；会话按更新时间保留最多 200 条，缺失时间使用文件修改时间，不把历史文件刷新为刚完成。

前端 `features/plugins/` 提供类型化 IPC、共享快照与 manifest 设置行。额度和会话适配在 `features/agent-status/PluginQuotaRings.tsx`、`pluginSessions.ts`；消息在 `features/messages/PluginMessagesPanel.tsx` 和 `pluginNotifications.ts`。原有渲染组件继续负责视觉、列表和预览仲裁。

默认索引 `https://github.com/flyl1u/fly-island/releases/latest/download/plugins-index.json`；环境变量 FOCUSD_PLUGINS_INDEX 优先，其次显式开发模式配置，最后默认。插件的可执行文件和 API schema 都经维护者 review；权限是声明，没有把普通进程称为沙箱。

## 内置时间与天气（2026-11-19）

`features/plugins/native/catalog.ts` 新增 `clockWeather`，kind 为 `island`。它沿用内置插件安装列表和发布市场开关，不启动独立插件进程。`features/weather/` 自包含设置、缓存、类型化 IPC、WMO 映射和收起态叶子组件；`PluginMarket` 安装后展示城市设置和两个独立开关，`CollapsedLayoutEditor` 安装后展示可排序状态位。

Rust `weather/` 用已有 reqwest 异步请求固定 Open-Meteo 端点；没有新依赖、凭据、自动定位或原生后台服务。天气每三十分钟刷新，失败静默保留有效观测，三小时到期隐藏；时间只由叶子组件整分钟刷新。细节见 [时间与天气](../plugins/clock-weather.md)。
