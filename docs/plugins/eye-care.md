# 护眼提醒 / Eye Care

<img src="../assets/eye-care/logo.svg" alt="Eye Care Logo" width="80" height="80" />

作者 / Author：[zlohs (@zloghs)](https://github.com/zloghs)。Logo 沿用宿主 HeartPulse 图标，来源与许可见 [Logo 说明](../assets/eye-care/README.md)。

0.2.0 将休息画面交给 fly-island 宿主：使用同一 React 入口、主题、字体、lucide 与 SettingsLinkButton，替换固定配色的 Win32/GDI 窗口和按钮。窗口遵守[插件规范](README.md)及[插件 PR 自检](../../.github/PULL_REQUEST_TEMPLATE/plugin.md)。

## 使用与兼容

- 用眼 1–720 分钟（默认 20）、休息 1–60 分钟（默认 1）、空闲阈值 1–120 分钟（默认 5），仍为整数分钟并自动保存；旧秒数/小数分钟向上取整迁移不变。
- 空闲重置用眼周期，全屏暂停剩余用眼时间；休息使用单调时钟，不受两者影响。
- 休息期间每个显示器出现一个按需创建的宿主窗口，休息结束自动销毁。可推迟一次，仍有 10/15/20/25/30 分钟五档；之后主动休息也不会恢复该机会。允许跳过时才显示紧急解锁，后台同样校验权限。
- 窗口按物理显示器坐标定位，支持副屏负坐标与系统 DPI；热插拔会重建窗口，保留原截止时间。可见、已置顶的宿主窗口仍在休息画面上方；贴边、折叠和托盘隐藏由宿主管理，不强制显示隐藏窗口。
- 深浅色与材质跟随宿主；提醒语言沿用插件设置，使用宿主双语字典且不修改全局语言偏好。整屏背景遮挡工作内容，玻璃样式用于卡片，不额外捕获桌面。窄屏按钮换行，短屏可滚动，Tab 焦点沿用宿主控件。
- Alt+F4 不结束本轮休息；系统安全快捷键仍可用。这是休息画面，不是 Windows 身份验证锁屏。

**同时更新宿主和插件。** 新宿主为受支持的 eye-care 清单注入临时 `_host-eye-care-windows` 能力标记；不写入偏好。旧宿主缺少标记时，0.2.0 显示升级说明，不开始一个没有窗口的休息。旧 eye-care 插件仍走其原实现，不触发第二套宿主窗口。应用版本号不变。

## 生命周期与失败

只有安装、启用且进入休息状态才创建 WebView；未安装、停用、卸载、插件失败/重启、休息结束和宿主退出都会关闭窗口。状态由插件提供，窗口不接受插件 HTML/CSS 或外部网址。先取得状态并完成首帧，再显示全部显示器，避免空白窗口。创建失败会清理部分窗口并在岛内提示，不声称已覆盖全部屏幕；就绪超时 8 秒，每轮最多尝试 3 次，间隔至少 5 秒。

休息期间每秒检查显示器，最多保留一个等待处理的 UI tick；插件状态也合并为一个最新更新。会话令牌使停用前的旧消息无法重新打开窗口。非休息期间不运行窗口监视线程。采集仍每秒一次；CPU/常驻/峰值内存需真实桌面实测，不宣称已满足预算。

## 接入点与数据

- `plugins/eye-care`：计时状态与动作；Win32 只读空闲和全屏，保留 DPI 查询上下文，不再创建 UI。
- `src-tauri/src/plugin_host/service.rs`：受支持清单的状态接入与能力标记；`eye_care/` 管理窗口和有界生命周期。
- `src-tauri/src/win32/eye_care.rs`：窗口子类约束自身 Z-order；不更改宿主其他窗口的置顶、可见或最小化状态。
- `src/main.tsx` → `windows/eye-care` → `features/eye-care`：页面组合、订阅/首帧握手及主题化面板。
- 新标签 `eye-care-rest-*`，页面 `?window=eye-care`；新命令 `get_eye_care_break` / `show_eye_care_break_window` 与事件 `eye-care-break-changed`。既有命令、四个窗口标签、插件 id 和设置 key 保持兼容。

无联网、遥测或无关文件读取，不记录键鼠内容。偏好仍由宿主 `plugins-state.json` 保存；计时、窗口和会话只在内存。休息窗口独立 capability 只允许监听事件，不授予 opener/updater。

## 自行构建和验收

按[快速开始](quickstart.md)仅在本地启用发布开关，构建配套宿主和 eye-care 插件，再通过本地索引安装/更新；改清单后，开发目录需先卸载注册再重新加载。提交保留 `plugins: false`，不提交构建产物。

本次按用户要求不构建安装包或插件包。自动检查覆盖状态机、真实 stdio、旧宿主提示、消息合并和过期消息、主题/语言/窄屏/按钮/首帧时序；它们不替代真实桌面验收：

1. 多屏与不同 DPI（含负坐标副屏）均有完整遮挡，计时一致，热插拔不重置计时。
2. 五档推迟准确；禁止二次推迟，跳过关闭时没有入口，完成后自动关闭全部窗口。
3. 主岛折叠/展开/贴边及托盘隐藏可正常使用，休息画面不会盖过可见置顶宿主窗口或唤起隐藏窗口。
4. 深浅色、两种玻璃、中英文、窄屏、小分辨率及键盘 Tab 操作可用；提醒语言不改变宿主设置。
5. 停用/卸载/退出和插件崩溃后无残留窗口；缺失 WebView2/就绪失败有岛内提示，无空白遮挡；同时对照真实资源占用。

上游 PR 所需的真实小岛录屏、作者、公开联系方式和人工结果由作者提供，不伪造验收。

## English

Eye Care 0.2.0 replaces fixed-color Win32/GDI break UI with on-demand host Tauri windows. They reuse host React components, theme tokens, fonts, lucide and localized action controls, including dark/light schemes, both glass treatments, narrow widths and short-screen scrolling. Each monitor uses its physical bounds; existing visible topmost host windows remain usable, and hidden windows stay hidden.

The plugin retains its monotonic clock, legacy duration migration, idle/full-screen behavior, five exact postponements used once per cycle and optional skipping. Update both the host and plugin: a transient host-capability marker prevents silent missing windows on old hosts, while legacy plugins do not create duplicate host windows. No host version, existing command/window label or persisted preference key is changed. New window IDs, commands and the event are listed above.

Windows are created only during an enabled break, shown after initial state and first paint, and destroyed on completion, disable/uninstall, plugin failure/restart or shutdown. Partial failures are cleaned up, readiness is bounded and retries limited. Coalesced updates and session tokens prevent unbounded UI queues and stale messages reopening closed windows. No networking, telemetry, unrelated file reads or desktop capture is introduced.

No production build or package is made by this task. Automated checks do not replace physical multi-monitor/DPI, desktop layering, shutdown and measured resource acceptance. Authors must still supply a real in-island demo, contact details and manual results before an upstream PR.
