# 开机自启卡顿、展开后点不动、播放音乐高 CPU：排查与修复（v3.4.0）

日期：2026-11-17。对应反馈：开机自启后卡顿 / 个别蓝屏、#73、#75、#76（第 6 条的 4、5）、#80，以及「贴边一次后悬停不再展开」「展开后很多地方点不动、移到边缘就收起」。

本文只记录**能从代码确认**的根因和这次的改动；没能复现、只能推测的单独列出。

## 1. 开机自启卡顿 / 蓝屏

### 现状

- Run 值 `FocuSD Island` 只写 `"<exe>"`，无法区分开机启动和手动启动，所有初始化在登录那一刻同时跑。
- 首次显示 `show_ready_island → show_island → focus_window → force_foreground`：登录时对正在启动的前台程序做 `AttachThreadInput` + `SetForegroundWindow`。
- QQ 通知监听、微信提醒监听（读微信窗口、UIA、按需写微信进程内存）、网易云插件自动安装（启动 15 秒后，可能下载、可能弹 UAC）都在启动后立刻或很快开始。
- 每次岛屿改尺寸（`set_island_interaction` 是同步命令，跑在主线程）都调 `SHAppBarMessage` 查任务栏，它要等 Explorer 回应；登录 / 唤醒时 Explorer 正忙，主线程跟着卡。
- 微信标题栏按钮的 `WH_MOUSE_LL` 钩子：每次左键按下都在钩子回调里做 `GetWindowThreadProcessId`、`IsWindowVisible`、`SetThreadDpiAwarenessContext`、`GetWindowRect`、`WindowFromPoint`（会向目标窗口发 `WM_NCHITTEST`）。低级钩子回调期间整个系统的鼠标输入都在等它，超过 `LowLevelHooksTimeout` 还会被系统静默摘掉。

### 改动

| 项 | 改动 | 位置 |
|---|---|---|
| 区分开机启动 | Run 值改写为 `"<exe>" --autostart`（值名不变，见 contracts.md）。旧值启动一分钟后在后台改写一次 | `system/startup.rs` |
| 首次显示不抢焦点 | 开机启动时 `show_ready_island` 只显示、不 `focus_window` | `island/mod.rs` |
| 错峰 | `hold_after_autostart(delay)`：开机启动时，后台线程等到进程启动后 `delay` 再开始；QQ 监听 30 秒、微信监听 45 秒、网易云插件自动安装 120 秒。手动启动不受影响 | `system/startup.rs`、`qq_notifications/listener.rs`、`wechat_reminders/mod.rs`、`media_plugins/auto.rs` |
| 任务栏查询 | `top_taskbar_candidates` 缓存 3 秒 | `win32/taskbar_edge.rs` |
| 低级鼠标钩子 | 先用纯算术判断点是否在上次采样的按钮矩形内，绝大多数点击不做任何系统调用就放行；只有落在按钮上才走原来的完整校验 | `win32/caption_close.rs` |

微信相关只加延后，不改任何唤起 / 读取路径（遵守「第三方应用交互只加兜底不替换」）。

### 未改、待观察

- **蓝屏**：用户态程序本身不能直接蓝屏，更可能是登录时的负载叠加触发了驱动问题（显卡驱动对透明置顶窗口 + DWM、或安全软件对 `WriteProcessMemory` / 低级钩子的拦截）。这次减少的是开机时的并发负载和钩子耗时，没有直接证据。需要用户提供 minidump（`C:\Windows\Minidump`）里的出错模块。
- 前端 `useAgentStatus` 200 ms、`useAgentSessions` 1 秒的扫描属于 Agent 区域（另一个 session 负责），这次没动。
- 更新检查仍在前端启动后立即进行；如果开机卡顿仍有报告，可以让前端在开机启动时延后首轮检查（需要一个读启动方式的命令）。

## 2. #75 播放音乐时 CPU 25–39%、线程暴涨、暂停后不回落

### 根因（已确认）

1. `media_control/session.rs::on_media_thread` 每次读取都 `thread::spawn` 一个新线程并进入新的 COM MTA；`audio.rs::read_system_audio_peak` 每次 `CoCreateInstance(MMDeviceEnumerator)` 再为 3 个角色各 `Activate` 一个峰值表。播放时前端 500 ms 读一次电平、1.5 秒读一次状态，issue 里实测约 37 个线程/秒的创建退出，CPU 大头在这些短命线程上。
2. 前端 `useMediaState` 的快速电平轮询条件是 `playing || audioActive`。没有媒体会话时，后端把「系统输出峰值超过 0.000015」当成在播放，这个阈值几乎等于底噪：任何程序发声（游戏、浏览器、提示音）都会让 `audioActive` 一直为真，快速轮询永不停止，这就是「暂停后不回落」。

### 改动

- 新增 `media_control/worker.rs`：一个常驻的 `media-com` 线程（MTA）按顺序执行所有媒体 / 音频读取，30 秒没有任务自动退出；一个任务卡住超过 5 秒时放弃该线程、另起一个（最多同时放弃 4 个，超过就直接报错而不是继续开线程）。
- `audio.rs`：在工作线程上缓存枚举器和默认输出设备的音量 / 峰值表，每 5 秒或读取失败时重新取默认设备（跟随切换耳机 / HDMI），只用 Multimedia 角色；`read_master_volume` / `set_master_volume` 也走缓存。线程退出前先释放 COM 对象再退出公寓。
- 前端：快速电平轮询只在「有媒体会话且正在播放」时运行；无会话时只靠 1.5 秒的状态轮询读峰值。

## 3. #73 游戏模式下鼠标到顶沿，岛屿恢复并把游戏切走

### 根因（已确认，几处叠加）

1. 原生 `island/passthrough.rs` 的光标循环只看形状：贴边露边条被命中就取消穿透、发 `island-hover-changed`、`raise_topmost`，完全不看游戏模式。
2. 前端 `IslandShell` 的 `onMouseEnter`（贴边时）→ `useTuckedHoverOpen` 无条件 `peekIsland()`，`quiet` 只挡住了「展开面板」那一半。
3. `system/fullscreen.rs::read()` 用前台窗口判断全屏；岛屿一旦成为前台（被点到或拿到焦点），判断就变成「没有全屏」→ `quiet` 解除 → 悬停展开和 `take_island_hover_focus`（`AttachThreadInput` + `SetForegroundWindow`）重新允许，游戏被最小化。

### 改动

- 新命令 `set_island_game_quiet`：前端把 `quiet` 告诉原生侧。`quiet` 且贴边时，`cursor_is_inside_island` 直接返回 false（整条露边不可命中、点击穿透到游戏）；`quiet` 时不 `raise_topmost`；`take_island_hover_focus` 在 `quiet` 时什么都不做（兜住在途请求）。
- `fullscreen.rs`：前台窗口属于本进程时保持上一次的判断，不再因为岛屿自己在前台就结束游戏模式。
- 前端 `useTuckedHoverOpen` 新增 `blocked`，`quiet` 时贴边岛屿的 mouseenter 不再 peek。
- `useGameMode` 在 `!isTucked` 时清 `tuckedByGameRef` 是有意的设计（手动拉出来就不再自动收回）；误触发的来源已经堵住，这里保持不变。
- 主窗口没有加 `WS_EX_NOACTIVATE`：岛屿里有输入框（待办、笔记、翻译），全局加会让它们无法输入。贴边时已完全不可命中，未贴边的岛屿被用户主动点击时激活属于预期。

## 4. 贴边隐藏一次后悬停不再自动展开（需点一次）

### 根因（已确认）

`useIslandHover` 把 `isTucked || isPeeking` 传给 `useHoverExpand`。`isPeeking = isPeekTuck && !isTucked`，而 `isPeekTuck` 由「最小化到顶部」和「闲置贴边 + 自动收回」（`autoTuckRetract` 默认开）设置，默认 `tuckedHoverAction: "reveal"` 下只有点击打开页面才会清掉。于是第一次贴边后，岛屿永远处在 peek 状态，`useHoverExpand` 一直把它当贴边处理，悬停永不展开，直到点一次。

### 改动

只传 `isTucked`。从贴边滑出的那一刻光标在岛上，`useHoverExpand` 原有的 `armedRef` 逻辑会先解除武装，所以滑出本身不会展开；光标离开再回来（或停留在已滑出的岛上重新进入）就和没贴过边一样按悬停展开。

## 5. 展开后很多地方点不动、移到边缘就自动收起

### 根因（按确认程度）

1. **已确认**：`useHoverFocus` 在光标离开原生形状时**立即**（0 ms）`release_island_hover_focus`，把焦点还给原来的窗口；`useIslandWindow` 监听到失焦就立刻 `onCollapse()`。结果光标只要擦过形状边缘一下，岛屿就立刻收起，完全绕过「展开后自动收起」的延迟。
2. **已确认**：原生侧展开高度上限 656（`DEFAULT 306 + RANGE 350`），而 Agent 页 5 个会话 + 120% 字号 + 多行额度时前端高度超过 656。原生命中区比可见面板短，底部几行点击穿透，光标移到那里还被当成「离开岛屿」，叠加第 1 条立刻收起。
3. **已缓解**：`set_island_interaction` 跑在主线程，内部 `SHAppBarMessage` 等 Explorer；主线程卡住时 `set_ignore_cursor_events` 排在后面，窗口停在穿透态，表现为点不动。任务栏查询已缓存（见第 1 节）。
4. **未确认**：多显示器不同缩放时命中区换算（`窗口物理宽 / 820`）。窗口跨屏时 tao 会按 DPI 调整窗口物理宽度，换算仍成立；没有找到能出错的路径，未改。原生 `top_attached` 与前端 `isDetached` 的判定也没找到不一致的路径。

### 改动

- 离开展开面板后，焦点在 `max(展开后自动收起延迟, 300 ms)` 之后才归还；期间光标回来就取消。收起时仍立即归还。
- 原生展开高度上限提到 800。

## 6. #76-4 岛不在焦点时按剪贴板快捷键，松手后岛又收起

### 根因（已确认）

快捷键 → `focus_island_for_shortcut` 记下前一个窗口并把焦点给岛 → 岛展开、光标不在岛上 → `hoverFocusAction` 判为 release → `release_island_hover_focus` 在修饰键按着时返回 false 并每 120 ms 重试，**修饰键一松开**就把焦点还回去 → 失焦收起。所以必须一直按着直到动画结束（之后光标位置 / 状态变化让它不再触发）。

### 改动

`hoverFocusAction` 新增 `entered`：展开以来光标从没进过面板（快捷键打开）时不归还焦点，交给原来的收起逻辑（点外面、Esc、再按快捷键）。光标进过面板后行为和以前一样。

## 7. #76-5 刚唤醒系统，用快捷键打开剪贴板点击复制时卡死、系统变慢、随后闪退

没能复现。能确认的风险：`copy_clipboard_history_item`、`toggle_clipboard_history_favorite`、`set_clipboard_history_item_note`、`delete_clipboard_history_item`、`clear_clipboard_history` 都是同步命令，Tauri 2 里同步命令跑在主线程。复制时要 `OpenClipboard`（被别的进程占着时重试并 `sleep`）、图片要整张解码再写 DIB、其余要写历史文件。刚唤醒时剪贴板链（剪贴板监视程序、远程桌面、输入法）和磁盘都可能很慢，主线程卡住后所有岛屿窗口失去响应，置顶透明窗口不响应时 DWM 会做幽灵窗口处理，与「整个系统很卡」的描述相符；之后的闪退可能是 WebView2 判定渲染进程无响应。

**改动**：上述五个命令改为 `async` + `spawn_blocking`，在后台线程执行；命令名、参数、返回值不变。

仍需用户反馈：如果再次出现，请提供 `%LOCALAPPDATA%\com.focusd.island` 下 WebView2 的崩溃转储和 Windows 事件查看器「应用程序」里的错误。

## 8. #80 卸载勾选删除应用数据后 AI hook 残留

`src-tauri/nsis/installer-hooks.nsh` 新增 `NSIS_HOOK_PREUNINSTALL`：仅在 `$DeleteAppDataCheckboxState = 1` 且 `$UpdateMode <> 1`（不是更新时的卸载）时，在删除可执行文件之前 `ExecWait "<exe>" --remove-agent-hooks`。变量名按当前 `@tauri-apps/cli` 2.11.4 的 NSIS 模板核对过。

`--remove-agent-hooks` 在 `run()` 最前面处理（单实例插件之前），复用 `remove_managed_codex_hook_block`、`remove_managed_claude_code_hooks` 和回复标记的关闭逻辑，只删 Fly Island 写入的内容；读不了或解析不了的配置文件不碰（`agent_status/uninstall.rs`，有单元测试）。
