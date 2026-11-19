# 插件宿主（外部数据接入）

注意：「插件」在产品上指对小岛源码的改造，PR 合并后由维护者适配成按需安装（见 [插件开发规范](../plugins/README.md)）。本文的插件宿主是其中一种已有机制：用独立进程把外部数据（额度、会话、消息）接进小岛。

API v1 已实现为独立进程平台，协议见 [API](../plugins/api.md)。没有动态库、脚本解释器或 Webview 插件。

`plugin_host/manifest.rs` 校验清单；`protocol.rs` 校验快照；`packages.rs` 下载 / 哈希 / 受限 zip；`storage.rs` 安装状态与凭据；`process.rs` stdio 握手、请求超时和有限重启；`service.rs` 管理进程、安装事务与快照；`mod.rs` 只组装 Tauri 命令。已安装插件由各自进程执行，主程序不依赖插件 crate。

`win32/process_job.rs` 以 kill-on-close Job Object 管理插件及其子进程；正常停止先发可选 `shutdown`，最多等待 3 秒，再结束进程树。旧 v1 插件不实现 shutdown 仍可被停止。SDK 的输入和输出均限制为 256 KiB；会话按更新时间保留最多 200 条，缺失时间使用文件修改时间，不把历史文件刷新为刚完成。

前端 `features/plugins/` 提供类型化 IPC、共享快照与 manifest 设置行。额度和会话适配在 `features/agent-status/PluginQuotaRings.tsx`、`pluginSessions.ts`；消息在 `features/messages/PluginMessagesPanel.tsx` 和 `pluginNotifications.ts`。原有渲染组件继续负责视觉、列表和预览仲裁。

声明 `panel` 的插件拥有自己的岛屿页面：`windows/island/features.ts` 把已启用插件映射为 `plugin:<id>` 页，顶栏在自带页按钮之后渲染它的按钮（图标来自 manifest 的白名单，`attention` 时带点）；`features/plugins/PluginPanel.tsx` 用原生组件画 `headline`、行、进度条、宿主自己倒数的 `countdownTo` 和动作按钮。页面高度按行数计算，随 publish 更新；插件停用或进程消失时该页回到第一个可用页。插件关闭（`release-features.json`）时整条链路不产生按钮或页面。

默认索引 `https://github.com/flyl1u/fly-island/releases/latest/download/plugins-index.json`；环境变量 FOCUSD_PLUGINS_INDEX 优先，其次显式开发模式配置，最后默认。插件的可执行文件和 API schema 都经维护者 review；权限是声明，没有把普通进程称为沙箱。

`plugins/eye-care/` 是独立护眼插件：`clock.rs` 管理单调时钟与一次推迟状态，`panel.rs` 输出宿主面板，`win32/` 只隔离空闲 / 全屏探测。0.2.0 多屏休息窗口由宿主 `src-tauri/src/eye_care` 与 `src/windows/eye-care` 按需创建，复用共享主题与控件。它只依赖插件 SDK 与 Windows API，不向主程序引入依赖；配置复用宿主插件设置，生命周期随启停和 stdin EOF 结束。详见 [护眼插件](../plugins/eye-care.md)。
