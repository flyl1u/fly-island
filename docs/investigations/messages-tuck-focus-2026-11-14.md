# 消息弹出、贴边、微信唤回与 Alt+Tab 排查（2026-11-14）

v3.2.0 发布后收到的 5 项反馈，其中几项作者本机复现不了，结论主要来自读代码，以及在本机检查正在运行的岛屿窗口。每项分「已确认」和「推测」两部分；推测的路径做了防御性修复并补了测试。

| # | 反馈 | 提交 |
|---|---|---|
| 1 | 有消息时岛屿不从贴边态弹出 | `6f97b568`（全屏检测） |
| 2 | 点开一个人的消息只清这个人 | `fb832137` |
| 3 | 「这些时候不贴边」开关失效 | `9e92e5fd` |
| 4 | 微信报错「weixin:// 找不到应用程序」 | `f385853b` |
| 5 | Alt+Tab 等系统快捷键失灵 | `1f784e39` |

## 1. 有消息时岛屿不从贴边态弹出

**链路**：Rust 收到 QQ toast / 微信闪烁 / 新邮件 → `publish` 带上 `windowVisible`（主窗口 `is_visible()`）发事件 → 前端 `useQQNotifications` / `useWeChatReminders` / `useMail` 在 `canPreview` 为真时生成预览（`canPreviewMessages = !quiet && mode === "collapsed" && (!isTucked || revealOnMessage)`）→ `hasMessagePreview` → `useRevealOnMessage` 调 `revealForMessage` 把岛从边缘滑出 → 预览结束后 `useTuckPeek` 让它缩回。

逐项检查：

- **游戏模式误判（主要嫌疑，已修）**：`gameDoNotDisturb` 默认开启，`quiet` 会挡掉所有消息预览和悬停展开。原判定只看 `SHQueryUserNotificationState` 是否为 `QUNS_BUSY` / `QUNS_RUNNING_D3D_FULL_SCREEN` / `QUNS_PRESENTATION_MODE`。`QUNS_BUSY` 只是 shell 的猜测，网上大量报告它在没有全屏应用时也会长时间返回（全屏透明覆盖层、桌面、曾经全屏过的窗口等），这类机器上岛就一直静默。这和「部分用户」「作者复现不了」都对得上。**修复**：`BUSY` / `D3D` 还要前台窗口可见、类名不是 `Progman` / `WorkerW` / 任务栏，并且窗口矩形覆盖整个显示器才算；演示模式照旧算（`system/fullscreen.rs::is_fullscreen_foreground`，有单元测试）。
- **三种贴边样式**：Rust `geometry.rs` 只改窗口位置和热区大小，不隐藏窗口，`windowVisible` 在细线 / 露边 / 隐藏三种样式下都为真，前端判断也不区分样式。没有差异。
- **托盘隐藏**：窗口隐藏时 `windowVisible` 为假，预览被丢弃。这是设计行为（藏到托盘就不打扰）。
- **多显示器**：`quiet` 对任意显示器上的全屏应用都生效（抢焦点会把任何显示器上的游戏最小化），`tuck` 只看岛所在的显示器。属于设计行为；上面的误判修复同样适用。
- **消息去重 / 节流**：QQ 只把和上次快照不同的 toast 当新消息；三个来源的预览共用 `nextQQPreview`：一串连续消息（间隔 ≤ 5 秒）从第一条起最多弹 10 秒，之后要等出现 5 秒以上的间隔才会再弹。所以在一直刷屏的群里，10 秒后就不再弹出，这是有意的节流，不是 bug。微信在 4 秒内重复闪烁只算一次提醒。
- **计时器竞态**：预览存在时闲置计时器（`idlePlan`）和缩回（`useTuckPeek`）都暂停，预览结束后才开始计时。没找到竞态。
- **webview 节流**：贴边时窗口仍在屏幕上（热区在屏内），不会被判定为隐藏。弹出链路是事件 → React 状态 → `syncNativeInteraction` 的 Promise 队列，不依赖 `requestAnimationFrame`，即使被节流也只是计时器变慢，不会卡住。
- **小问题（未改）**：`useIslandNotices` 的 `hasMessagePreview` 只看各来源有没有预览，`IslandShell` 用 `latestPreviewAt` 只显示最新的那条；两个来源的预览时间窗口交错时，可能出现岛弹出了却没显示内容的空窗。影响很小，记录在这里备查。

**需要实机验收**：在一台复现机上，没有全屏应用时确认消息能弹出、悬停能展开（即 `get_foreground_fullscreen` 返回 `active: false`）；打开真全屏游戏或 F11 浏览器，确认仍会静默。

## 2. 按人已读

**现状**：QQ 通知和微信消息只保存在 Rust 内存里（`NotificationBuffer` / `ReminderState`），前端没有已读记录，也不涉及任何 localStorage key，所以不需要做旧数据迁移。原来点开一条消息只会让收起态预览消失，列表里的消息并不会因为点开而减少，只能整体清空。

**新行为**：

- QQ：toast 标题就是联系人名或群名，按标题归属。打开 QQ 成功后调用新命令 `dismiss_qq_contact(title)`，清掉这个标题下的全部通知。基线快照不变，所以通知中心里还留着的同一批 toast 不会被重新加回来；只有 QQ 发来新内容时才会再出现。
- 微信：消息按会话 key（`ChatPreview.key`）归属，同一会话每次提醒都会生成一条。打开成功后调用 `dismiss_wechat_conversation(messageId)`，清掉这个会话的全部预览。如果最新一次提醒包含这个会话，就把 `pending` 一并清掉，避免出现「新提醒」空卡片；`lastAttentionAt` 不变，所以不会因此再弹一次预览。
- 内容为空的普通提醒（没开摘要）没法对应到具体的人，点开时不清任何消息。
- 清除失败不报错：这时 QQ / 微信已经打开了，列表没更新不值得打扰用户。
- **邮箱不按发件人清**：邮件的已读状态在 IMAP 服务器上，按发件人批量标记会把用户没看过的邮件也标成已读，无法撤回。邮箱仍然只标记实际打开的那一封，和原来一样。

测试：Rust 单元测试（小明 3 条、小红 2 条，点开小明后剩小红 2 条），以及回归页 `message-clear` 的 QQ / 微信用例。

## 3. 「这些时候不贴边」开关失效

**已确认的原因**：

1. **只能挡住下一次闲置贴边，叫不回已经贴边的岛**（反馈最多的场景）：`keepIslandVisible` 只作为 `idlePlan` 的输入，让闲置计时器不启动。常见情况是：没放歌时岛先按闲置时间贴边，之后开始放歌（或 Agent 开始运行、待办开始计时），岛仍然是一条线，看起来就是开关失效。**修复**：`useIslandNavigation` 记下当前的贴边是不是闲置计时器造成的（`tuckedAutomatically`）；条件成立时 `revealsForKeepVisible` 把这种岛叫出来。用户最小化、拖到边缘，以及游戏模式造成的贴边不会被撤销。
2. **被带出后又自动缩回**：闲置贴边且开了「悬停后缩回」，或者被消息带出的岛，在预览或悬停结束后会缩回去，即使这时正在显示歌词。**修复**：`retractsPeek` 在条件成立、且原本是自动贴边时不缩回。
3. **待办计时结束后不重新判断**：`keepIslandVisible(..., Date.now())` 只在渲染时计算一次。计时结束后如果没有别的原因触发重渲染，岛就一直不贴边。**修复**：`keepVisibleChangesAt` 给出下一次结果会自己变化的时间点，`useKeepVisible` 到时重新渲染。

**检查过、没有问题的点**：

- 「歌词存在」的判定是 `collapsedItem === "lyrics" && songPlaying && showCollapsedText`，`collapsedItem` 就是收起态实际显示内容的选择结果（`pickCollapsedItem`，按用户排序；有待办计时时固定为待办），所以和收起态显示的内容一致。`songPlaying` 要求 SMTC / 网易云插件报告 `playing` 且有歌名。暂停、或切歌间隙超过贴边等待时间时会贴边，这符合「显示歌词时」的字面意思。
- 设置变更：设置窗口写 `focusd-island-settings` 后，主窗口通过 `storage` 事件实时读到，`isSameSettings` 会比较所有字段。
- 条件变化时计时器会重算：`useIdleTuck` 依赖 `enabled` / `seconds` / `view`，条件从真变假时会重新开始完整的等待。
- 「展开后自动收起」（`autoCollapseSeconds`）只在光标离开时计时，正在编辑草稿时不收起。消息预览会暂停闲置计时。

条件判断整理在 `src/windows/island/tuckRules.ts`、`keepVisible.ts`、`idleCollapse.ts`，都是纯函数，测试在 `tests/unit/tuck-rules.test.mjs`、`keep-visible.test.mjs`、`idle-collapse.test.mjs`。

**需要实机验收**：开启「小岛在显示歌词」，等岛闲置贴边后开始放歌，岛应当滑出并显示歌词；暂停超过贴边等待时间后应当重新贴边。最小化到边缘的岛放歌时不应滑出。

## 4. 微信「weixin:// 找不到应用程序」

**已确认的原因**：`wechat_reminders/mod.rs::restore_wechat` 在微信窗口不在前台时，一律用 `tauri_plugin_opener::open_url("weixin://")` 唤回。opener 插件走普通 `ShellExecute`，协议没有注册时由系统弹出截图里的错误框。新版微信（Weixin 4.x）和部分安装方式不注册 `weixin` 协议。另外，微信没在运行时，原来只报错、不会去启动它。

**修复**（`wechat_reminders/launch.rs`）：

1. 主窗口已经显示（没最小化）时，直接切到前台（`force_foreground`，挂接前台线程输入并成对解除）。
2. 隐藏到托盘或最小化时，用这个进程自己的 `Weixin.exe` / `WeChat.exe` 再启动一次。微信是单实例程序，会自己恢复界面，不会出现直接显示 Qt 窗口导致的白屏。
3. 只有 `HKCR\weixin\shell\open\command` 存在时，才用协议，并改为带 `SEE_MASK_FLAG_NO_UI` 的 `ShellExecuteExW`（`win32/shell_open.rs`）：即使失败也只返回错误，不弹系统对话框。
4. 微信没在运行：按注册表（`InstallPath` / 卸载项），再按 `Program Files\Tencent\{Weixin,WeChat}` 找到可执行文件后启动。
5. 失败时返回错误码 `wechat-open:*`，前端 `openError.ts` 翻译成中英文提示，在岛上的微信面板里显示；从收起态预览点开失败时会打开微信面板。

**需要实机验收**：在没有注册 `weixin` 协议的 Weixin 4.x 上，分别测试主窗口显示、最小化、关到托盘、未运行四种状态，确认都不弹系统错误框，前三种能回到原来的微信窗口（同一进程，不是新开一个）。

## 5. Alt+Tab 等系统快捷键失灵

**排查范围**：全局快捷键（`win32/hotkey.rs`，翻译 / 剪贴板 / Agent 审批）、低级钩子（全仓库没有 `SetWindowsHookEx`；`shell_hook.rs` 是 `RegisterShellHookWindow`，只接收消息，不拦截输入；点击外部用的是 40 ms 轮询而不是鼠标钩子）、`AttachThreadInput`（`window.rs` 的两处都在同一个函数里成对 detach）、合成按键（`media_control` 只发送媒体键）、鼠标穿透循环（只切换 `WS_EX_TRANSPARENT`，不碰键盘）、窗口扩展样式。

**已确认**：

1. **岛屿主窗口出现在 Alt+Tab 列表里**。在本机检查正在运行的 v3.2.0：主窗口 `fly-island` 的扩展样式是 `0xC0138`，含 `WS_EX_APPWINDOW`、没有 owner、没有 `WS_EX_TOOLWINDOW`。tao 给所有没有 owner 的窗口都加 `WS_EX_APPWINDOW`；`skipTaskbar` 只是通过 `ITaskbarList::DeleteTab` 去掉任务栏按钮，管不到 Alt+Tab。悬停取焦点（`take_island_hover_focus`）会把这个透明、置顶、看不见的窗口变成「最近激活」的窗口，用户快速按一下 Alt+Tab 就会切到它，看起来什么都没发生；连按时还会在列表里多出一个空白项。**修复**：`win32/task_switcher.rs` 给主窗口装一个子类，在 `WM_STYLECHANGING` 里始终把 `WS_EX_APPWINDOW` 换成 `WS_EX_TOOLWINDOW`。tao 每次切换鼠标穿透都会重写整套扩展样式，只设置一次的话很快就会被覆盖，所以要用子类拦截。
2. **`set_focus` 会合成 Alt 键**。tao 0.35 的 `force_window_active` 在 `SetForegroundWindow` 被拒绝时，会用 `SendInput` 发送一次左 Alt 按下 + 抬起。如果用户这时正按着 Alt 做 Alt+Tab，合成的 Alt 抬起会结束这次切换。会走到这条路径的调用：启动后的 `show_ready_island`（开机自启时用户正在别的窗口打字）、单实例唤醒、托盘、设置 / 翻译 / 剪贴板窗口的显示，以及快捷键触发后由前端稍后发起的聚焦。**修复**：统一改用 `system/window_focus.rs::focus_window`：先挂接前台线程输入来切换前台（成对解除），切过去之后才调用 `set_focus`（这时 tao 不会再合成按键）；切不过去就留在后面。

**防御性修复**：

- 按住 Alt / Ctrl / Win 时，悬停不抢焦点、也不归还焦点，返回 `false` 让前端稍后重试，避免在用户按快捷键时切换前台窗口。
- 快捷键解析拒绝 Alt+Tab、Alt+Shift+Tab、Win+Tab、Alt / Ctrl / Win+Esc、Ctrl+Shift+Esc、Alt+F4、Win+L、Ctrl+Alt+Delete。其中 `RegisterHotKey` 能注册成功的几个会抢走系统自己的功能。已保存的这类快捷键会注册失败，并提示原因。

**未改动**：`agent_status/workbuddy_connection.rs` 里还有一处直接调用 `set_focus`，属于并行 session 的修改范围，留给主会话合并后统一替换成 `focus_window`。

**需要实机验收**：悬停展开岛后移开，再按一下 Alt+Tab，应当回到上一个应用；按住 Alt 连按 Tab，列表里不应该有空白的 fly-island 项。开机自启后马上在别的窗口按 Alt+Tab，不应被打断。
