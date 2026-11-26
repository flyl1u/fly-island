# 插件宿主（外部数据接入）

注意：「插件」在产品上指对小岛源码的改造，PR 合并后由维护者适配成按需安装（见 [插件开发规范](../plugins/README.md)）。本文的插件宿主是其中一种已有机制：用独立进程把外部数据（额度、会话、消息）接进小岛。

API v1 已实现为独立进程平台，协议见 [API](../plugins/api.md)。没有动态库、脚本解释器或 Webview 插件。

`plugin_host/manifest.rs` 校验清单；`protocol.rs` 校验快照；`packages.rs` 下载 / 哈希 / 受限 zip；`storage.rs` 安装状态与凭据；`process.rs` stdio 握手、请求超时和有限重启；`service.rs` 管理进程、安装事务与快照；`mod.rs` 只组装 Tauri 命令。已安装插件由各自进程执行，主程序不依赖插件 crate。

`win32/process_job.rs` 以 kill-on-close Job Object 管理插件及其子进程；正常停止先发可选 `shutdown`，最多等待 3 秒，再结束进程树。旧 v1 插件不实现 shutdown 仍可被停止。SDK 的输入和输出均限制为 256 KiB；会话按更新时间保留最多 200 条，缺失时间使用文件修改时间，不把历史文件刷新为刚完成。

前端 `features/plugins/` 提供类型化 IPC、共享快照与 manifest 设置行。额度和会话适配在 `features/agent-status/PluginQuotaRings.tsx`、`pluginSessions.ts`；消息在 `features/messages/PluginMessagesPanel.tsx` 和 `pluginNotifications.ts`。原有渲染组件继续负责视觉、列表和预览仲裁。

默认索引 `https://github.com/flyl1u/fly-island/releases/download/plugins-channel/plugins-index.json`；启用开发发布开关的构建先读取 FLY_ISLAND_PLUGINS_INDEX，再使用开发者模式的自定义索引。插件的可执行文件和 API schema 都经维护者 review；权限是声明，没有把普通进程称为沙箱。

## 内置时间与天气（2026-11-19）

`features/plugins/native/catalog.ts` 新增 `clockWeather`，kind 为 `island`，并声明独立设置分类 `clockWeather`。它沿用内置插件安装列表和发布市场开关，不启动独立插件进程。`features/weather/` 自包含设置、缓存、类型化 IPC、WMO 映射和收起态叶子组件；`PluginMarket` 只负责安装卡片，安装后在设置侧栏显示独立的时间与天气页面，`CollapsedLayoutEditor` 安装后展示可排序状态位。

Rust `weather/` 用已有 reqwest 异步请求固定 Open-Meteo 端点；城市搜索质量不足时补充 Nominatim，用户点击定位时优先 Windows Geolocator，再以 `ipwho.is` 粗定位兜底；没有凭据或原生后台服务。天气每三十分钟刷新，失败静默保留有效观测，三小时到期隐藏；时间只由叶子组件整分钟刷新。细节见 [时间与天气](../plugins/clock-weather.md)。

`plugins/eye-care/` 是独立护眼插件：`clock.rs` 管理单调时钟与一次推迟状态，`panel.rs` 输出宿主面板，`win32/` 只隔离空闲 / 全屏探测。0.2.0 多屏休息窗口由宿主 `src-tauri/src/eye_care` 与 `src/windows/eye-care` 按需创建，复用共享主题与控件。它只依赖插件 SDK 与 Windows API，不向主程序引入依赖；配置复用宿主插件设置，生命周期随启停和 stdin EOF 结束。详见 [护眼插件](../plugins/eye-care.md)。


## 正式市场包

插件市场打开时，正式宿主只安装和运行 `plugins/market-packages.json` 中的包，固定使用官方索引。清单之外的外部插件卡片显示「开发中」。收录流程：改清单 → 运行 `pnpm release:plugins` 发布独立通道 → 下一个应用版本带上新清单。已收录插件的更新无需发布应用。v3.3.0 及以前正式版不受影响。开发目录和自定义源仍由 `plugins` 发布开关控制。日历标记沿用内置插件开关。设备市场包只在设备/设置页或收起态的低频电量检查时使用独立读取器，由宿主解析安装目录与结束读取进程。该包由 C# bridge（音频与两个原生读取器）和 Rust 读取引擎（`plugins/device-battery/engine`，插件工作区成员，48 个读取器）组成，不含 Python；引擎按宿主固定的路径放在 `engine/runtime/python.exe`，每次读取起一个新进程，详见 [插件说明](../../plugins/device-battery/README.md)。MiniMax Code 与护眼提醒使用 stdio。

安装失败按目录不可达、目录或宿主不兼容、尚未收录、下载、完整性、解包、启动分别提示。市场仅显示已知本地化错误，不显示原始 URL 或路径。诊断写入 `plugin-logs/catalog.log` 和 stderr，插件运行日志仍在 `<id>.log`。
