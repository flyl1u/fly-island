# 护眼提醒 / Eye Care

<img src="../assets/eye-care/logo.svg" alt="Eye Care Logo" width="80" height="80" />

作者 / Authors：[zlohs (@zloghs)](https://github.com/zloghs)、[flyliu](https://github.com/flyl1u)。插件卡片和分组标题用宿主手绘的应用图标（`src/assets/plugins/eye-care.svg`）；[Logo 说明](../assets/eye-care/README.md) 记录随插件提交的原图形来源与许可。

0.3.0 同步了 #92 的更新（岛内快捷操作、清单 `description` 等新字段），需要 Fly Island 3.4.0 及以上（`plugins/eye-care/min-app-version.txt`），旧版宿主不会被推送此版本。

0.2.0 将休息画面交给 Fly Island 宿主：使用同一 React 入口、主题、字体、lucide 与 SettingsLinkButton，替换固定配色的 Win32/GDI 窗口和按钮。窗口遵守[插件规范](README.md)及[插件 PR 自检](../../.github/PULL_REQUEST_TEMPLATE/plugin.md)。

## 使用与兼容

- 用眼 1–720 分钟（默认 20）、休息 1–60 分钟（默认 1）、空闲时长 1–120 分钟（默认 5），仍为整数分钟并自动保存；旧秒数/小数分钟向上取整迁移不变。
- 空闲重置用眼周期；「全屏模式下暂停并重置计时」开启时（默认），全屏窗口同样重置并冻结用眼计时，恢复窗口视图后从完整周期开始，关闭后全屏不影响计时。休息使用单调时钟，不受两者影响。
- 休息期间每个显示器出现一个按需创建的宿主窗口，休息结束自动销毁。可推迟一次，仍有 5/10/15/20/25/30 分钟六档；之后主动休息也不会恢复该机会。允许跳过时才显示「跳过休息」，后台同样校验权限。
- 窗口按物理显示器坐标定位，支持副屏负坐标与系统 DPI；热插拔会重建窗口，保留原截止时间。可见、已置顶的宿主窗口仍在休息画面上方；贴边、折叠和托盘隐藏由宿主管理，不强制显示隐藏窗口。
- 深浅色与材质跟随宿主；提醒语言沿用插件设置，使用宿主双语字典且不修改全局语言偏好。整屏背景遮挡工作内容，玻璃样式用于卡片，不额外捕获桌面。窄屏按钮换行，短屏可滚动，Tab 焦点沿用宿主控件。
- Alt+F4 不结束本轮休息；系统安全快捷键仍可用。这是休息画面，不是 Windows 身份验证锁屏。

**同时更新宿主和插件。** 新宿主为受支持的 eye-care 清单注入临时 `_host-eye-care-windows` 能力标记；不写入偏好。旧宿主缺少标记时，0.2.0 显示升级说明，不开始一个没有窗口的休息。旧 eye-care 插件仍走其原实现，不触发第二套宿主窗口。应用版本号不变。

设置中的「空闲时长」说明由清单的 `settings[].description` 提供，文案为「连续无键盘和鼠标操作到达空闲时长，暂停并重置用眼计时，恢复操作后开始计时」；已开始的休息不受影响。另有开关「全屏模式下暂停并重置计时」：开启时进入全屏即把用眼计时重置为完整周期并冻结，退出全屏后从完整周期重新走表；关闭时全屏窗口不影响计时。（2026-11-26 用户要求）设置项文案为「允许跳过休息」，不再写成疑问句。岛内护眼面板不再提供额外的齿轮按钮，配置统一在设置窗口「功能」组末尾的护眼提醒栏目里。

岛内标题为「用眼中」「空闲中」「休息中」或「休息时间到」，标注分别是「剩余用眼时长」「剩余用眼时长」「剩余休息时长」和「累计用眼时长」。已推迟的用眼阶段提示「已经推迟过一次，不能推迟下次休息」。不再显示规则、配置时长或远眺 / 自动解锁说明；空闲和全屏暂停时倒计时和进度条都保留，只是停住不动：不再给 `countdownTo`，改用 `durationMs` 和冻结的 `percent`。岛内页面由护眼自己的组件绘制（`src/features/eye-care/EyeCareIslandPanel`），通用插件页不受影响：状态、剩余时间、剩余进度条和「现在休息」收在一张卡片内，26px 等宽倒计时在上、标签在下、4px 进度条在底，页高由 `getEyeCareIslandHeight` 单独计算。（2026-11-26 用户要求；2026-11-28 要求空闲时显示「空闲中」，并且暂停后倒计时与进度条不消失）

岛内与休息窗口使用同一截止时间和倒计时计算，按剩余秒数改变的边界刷新，不再各自从挂载时刻启动一秒定时器。窗口重新可见或获得焦点时立即校准，切换截止时间立即更新，结束后停止刷新。

休息画面只保留标题「休息一下」、剩余倒计时、推迟档位和可选的「跳过休息」：不再显示带眼睛图标的插件名标志、远眺 / 闭眼提示，也不写「休息结束后自动开始下一轮」；跳过按钮直接写「跳过休息」。（2026-11-26 用户要求）版式沿用岛内护眼页：整块屏幕作为遮罩，中间一张卡片，12px 的标题在上，倒计时用黄色等宽数字（`--color-warning`，与岛内休息状态的剩余时长同色；52–88px，随窗口宽度缩放），标签「剩余休息时长」在下，再往下是 4px 的剩余进度条（同色）；分隔线以下依次是「可以推迟一次，下次请完成休息」、六档推迟胶囊按钮（5/10/15 与 20/25/30 分两行三列）和右下角的「跳过休息」。进度条直接使用面板上报的 `percent`，宿主不再自行推算；插件未提供时只显示数字。

休息时，岛内仅显示状态和倒计时，移除重复的「推迟 10 分钟」与「跳过休息」按钮。推迟和跳过统一在休息窗口操作。面板用 `islandActions` 告诉宿主岛上显示哪些动作（用眼阶段为 `reset_work` 与 `rest_now`，休息阶段为空），`actions` 仍保留 `snooze_10` / `skip`，继续用于宿主判断推迟与跳过权限。页面上最后一个按钮是主按钮，前面的按钮是次要选项，所以「重置用眼时长」在左、填充样式的「现在休息」在右。

### 提醒方式

设置项「提醒方式」是两段式按钮，和「通用 → 展开方式」的「点击 / 鼠标悬停」是同一个宿主控件（清单 `type: "choice"`）。这套设置和面板字段是宿主新增的（清单 `showWhen`、面板 `durationMs`），宿主与插件需要一起更新，旧版宿主解析不了这份清单。

- **锁屏模式**（默认）：到点后照旧在小岛和多屏窗口显示休息画面。只有这个模式才用得上「休息时长」和「允许跳过休息」，切到通知模式后清单用 `showWhen` 把这两行从设置页隐藏（已保存的值保留，插件仍会收到）。手动点「现在休息」仍然立刻进入休息画面。
- **通知模式**：到点不锁屏，也不创建任何休息窗口。

通知模式到点、或手动点「现在休息」，都进入「休息时间到」：小岛自动展开到护眼页并保持展开——点岛外不会收起，直到用户在页面上作答；标题是「休息时间到」，大号数字从倒计时换成「累计用眼时长」的实际累计值并停在那里，进度条满格，标题下不再写其他说明。按钮换成「推迟休息」与「休息完成」（后者是填充的主按钮）：

- 「推迟休息」开下一轮用眼，累计时长接着加；再次到点仍进入「休息时间到」。
- 「休息完成」把累计用眼时长归零，重新开始计时。
- 两个选择都会清掉 `attention`，小岛随之自动收起。

用眼阶段的「重置用眼时长」把当前周期和累计时长都归零，并恢复一次推迟机会；它只在「用眼中」出现，到期后由上面两个按钮取代。

累计只在真正用眼时增加：休息期间不增加；进入「休息时间到」时停在当时的数值，之后空闲或全屏暂停也不会改变它。

插件通过面板行的 `durationMs` 把固定时长交给宿主（暂停时的剩余时间、休息时间到的累计值），宿主原样显示、不自行计时，因此不需要每秒 publish。这也让宿主区分两种提醒：`attention` 为真且 timer 行带 `countdownTo` 时创建休息窗口（锁屏模式到点），`attention` 为真但没有 `countdownTo` 时只展开小岛（通知模式到点，以及通知模式下手动「现在休息」）。

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

插件市场中显示「开发中」，暂未开放安装。开发者可按[快速开始](quickstart.md)启用外部插件开发模式，用本地索引安装或更新。休息到时宿主也会清理窗口，插件进程即使停止上报，遮罩仍会消失。

真实桌面验收包括多屏与混合 DPI、热插拔、折叠与贴边、托盘隐藏、退出和资源占用。原作者的单屏演示及已完成的实测记录见 [Fly Island #92](https://github.com/flyl1u/fly-island/pull/92)。

## English

During a break, the island shows status and the countdown without duplicate postpone/skip buttons. Use the break window for those actions. The panel names the page's buttons in `islandActions` (`reset_work` and `rest_now` while working, empty during a break) while `actions` keeps `snooze_10` / `skip` for the host's permission checks. The last button on the page is the filled main action, so Reset screen time sits to the left of Take a break now.

**Reminder style.** The new setting is a two-option segmented control, the same host control as General → Open the island by (`type: "choice"` in the manifest). **Lock screen** (default) keeps the old behaviour: the island and every display show the break at the deadline, and only this style uses the break length and the skip switch — notify mode hides both rows through `showWhen` (their saved values are kept and still reach the plugin). Asking for a break by hand still covers the screens here. **Notify** never covers them: at the deadline, or when a break is asked for, it goes to “Break time”.

In notify mode that state opens the island on the Eye Care page and keeps it open, ignoring clicks outside, until the user answers. The headline is Break time, the big number becomes the actual accumulated screen time and stays there, the bar is full, and nothing is written under the headline. Its two buttons are Postpone the break and Break done (the filled one): postponing starts the next round and keeps adding to the total, while Break done resets the total to zero; either answer clears `attention` and the island closes itself.

While working, Reset screen time restarts the round and the total and restores the one postponement; it appears only in the working phase, and the two answers replace it once the time is up. Only real screen time is counted: a break adds nothing, and the total stops where it was when the break came due — idling or a full-screen window does not move it. The panel row carries `durationMs` — a fixed duration for a paused timer or a finished total — so the host shows it as it is and the plugin does not publish every second; that field also tells the two cases apart — `attention` with a `countdownTo` opens the break windows, `attention` without one only opens the island.

The island and break window share the countdown calculation and absolute deadline. Updates align with remaining-second boundaries rather than mount times, resync on focus/visibility, and stop at zero.

The break window keeps only the “Take a break” title, the remaining countdown, the postponement choices and the optional “Skip break”. The Eye Care badge with its eye icon, the looking-away hint and “Your next interval starts automatically” are gone, and skipping is no longer worded as an emergency unlock. (2026-11-26, per user request)

The layout follows the island's Eye Care page: the display itself is the dim surface, with one centred card. A 12px title sits on top, the countdown uses the warning yellow the island shows while resting (`--color-warning`) in tabular figures (52–88px, scaling with the window), “Remaining break time” sits under it, then a 4px bar in the same tone for the share left. Below a divider come the one-postponement note, six postponement pills in two rows of three (5/10/15 over 20/25/30) and “Skip break” in the bottom-right corner. The bar reads the panel's reported `percent`; the host no longer estimates it, and the digits stand alone when the plugin sends none.

Eye Care 0.2.0 replaces fixed-color Win32/GDI break UI with on-demand host Tauri windows. They reuse host React components, theme tokens, fonts, lucide and localized action controls, including dark/light schemes, both glass treatments, narrow widths and short-screen scrolling. Each monitor uses its physical bounds; existing visible topmost host windows remain usable, and hidden windows stay hidden.

The plugin retains its monotonic clock, legacy duration migration, idle and optional full-screen resets, five exact postponements used once per cycle and optional skipping. Update both the host and plugin: a transient host-capability marker prevents silent missing windows on old hosts, while legacy plugins do not create duplicate host windows. No host version, existing command/window label or persisted preference key is changed. New window IDs, commands and the event are listed above.

Windows are created only during an enabled break, shown after initial state and first paint, and destroyed on completion, disable/uninstall, plugin failure/restart or shutdown. Partial failures are cleaned up, readiness is bounded and retries limited. Coalesced updates and session tokens prevent unbounded UI queues and stale messages reopening closed windows. No networking, telemetry, unrelated file reads or desktop capture is introduced.

The idle-duration setting carries its explanation in the manifest (`settings[].description`), which the host shows under the label: inactivity pauses and resets the screen-time timer, which starts when input resumes; an ongoing break is unaffected. A separate switch, “Pause and reset the timer in full screen”, is on by default: entering a full-screen window restarts the eye-use interval and freezes it, and leaving it resumes the whole period. Switched off, full screen no longer affects the timer. The skip setting reads “Allow skipping a break” rather than a question. Configure Eye Care in its own section at the end of the Features group in Settings; its island panel has no additional settings gear.

The island shows “Screen time”, “Idle”, “Resting” or “Break time”, with “Screen time remaining”, “Break time remaining” or “Total screen time” under it. After a postponement, screen time also shows “Already postponed once; the next break cannot be postponed”. Rule summaries, configured durations and break instructions are omitted; an idle desk or a full-screen pause keeps the countdown and the bar, frozen (no `countdownTo`; a fixed `durationMs` and a held `percent` instead). The page is Eye Care's own component (`src/features/eye-care/EyeCareIslandPanel`), so the host's generic plugin page is unchanged: the phase, the remaining time, a remaining-time bar and Take a break now share one card, with a 26px tabular countdown over its label and a 4px bar below; and `getEyeCareIslandHeight` sizes the page. (2026-11-28: the idle phase is named “Idle”, and a paused timer keeps its digits and bar.)

Eye Care is listed as In development in the plugin market. Developers can use a local index as described in the [quickstart](quickstart.md). The host also expires break windows at the deadline if the worker goes quiet. Physical multi-monitor/DPI behavior, desktop layering and resource use should be checked on the target setup.
