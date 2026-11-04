# 微信提醒上岛

首版接收微信的任务栏“请求关注”事件，显示“微信有新提醒”，点击打开微信。它不读取聊天正文，不显示发送人或准确未读数，也不把一次闪动算成一条聊天消息。

## 使用

1. 展开岛屿，点击右上角消息气泡。
2. 在 QQ、微信、邮箱共用的来源导航中选择「微信」，确认「接收微信提醒」已开启。首次启动默认开启，无需额外授权；QQ 与微信的开关相互独立，也可在「设置 → 消息接收」中关闭。
3. 保持电脑版微信登录、后台运行。当微信发出任务栏提醒时，折叠岛预览 5 秒，之后保留绿色提醒点。
4. 点击预览或「打开微信」前往微信。微信窗口获得前台关注后，岛内提醒点清除；这不代表微信聊天已读。

微信与 QQ、邮箱使用同一消息面板。右侧保留接收开关和打开微信图标；面板显示待关注、暂无提醒、暂停或连接状态。来源切换时保持相同的紧凑布局，提醒点只表示微信请求关注。

打开动作先确认已有完整主窗口，再通过微信在 Windows 注册的 `weixin://` 入口将唤回请求交给客户端，等待原主进程的窗口恢复。窗口选择优先可见的完整主窗口，再选择较早启动的实例，忽略尺寸不足的登录和辅助窗口。未定位到原窗口时显示错误，提示先从系统托盘打开并登录微信。

该入口由微信自身管理显示和渲染状态，不再直接对微信调用 `ShowWindowAsync` 或窗口恢复命令，也不以无参数启动器打开新的登录窗口。未注册协议或未能恢复原窗口时明确报错，不退回强制显示隐藏窗口。

重复闪动合并为同一项待关注提醒，不重复计数或延长预览。展开编辑、边缘收起或托盘隐藏时只更新提醒点，不主动展开、显示窗口或抢焦点。QQ 和微信预览重叠时优先显示最近到达的一项。

功能首次默认开启，自动初始化监听。只将启用偏好写入 `focusd-island-wechat-reminders-enabled`；主动关闭后重启仍保持关闭，旧版本保存的关闭选择也保持有效。提醒状态和时间保存在内存中，退出清空。监听不需要打开微信声音，不修改客户端设置，不读取聊天数据库、截图或可访问性文本，不注入微信进程。微信仍需在本机登录并发出任务栏提醒。

## 为什么不使用 QQ 的通知来源

本机微信 `4.1.9.35` 的 Windows 通知记录中只发现分享扩展，尚未验证聊天系统通知。用户提供的「设置 → 通知」页面包含新消息通知声音、通话声音、发现页和朋友圈提醒，没有聊天横幅或系统通知开关。声音开关不能直接提供聊天内容，不能将没有系统通知简单归因于用户未开启声音。

本方案使用 Windows `RegisterShellHookWindow` 接收 `HSHELL_FLASH`，通过通知窗口所属进程的完整可执行路径匹配本机微信。普通窗口创建和重绘不视为新提醒，其他应用事件被过滤。微信已在前台时不新增提醒。

任务栏请求关注可能来自聊天消息或其他微信提示，无法据此恢复文本、联系人或消息数量。微信若未发出任务栏提醒，本方案也不会凭空产生提醒。

## 只读诊断

在仓库根目录执行：

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --example wechat_reminder_probe -- --watch-seconds 60
```

可用 `--exe` 指定其他已安装的 `Weixin.exe` 或 `WeChat.exe` 绝对路径。工具使用与岛屿相同的原生事件接收模块，不显示窗口、不操作微信、不改变设置，输出只有状态和事件计数。

- 退出码 `0`：观察到该微信安装路径发出的任务栏请求关注事件。
- 退出码 `2`：本次没有验证到提醒；一次未捕获不能断定不兼容。`--watch-seconds 0` 仅检查注册和退出清理。
- 退出码 `1`：参数、安装路径或 Windows API 出错。

`weChatFlashEvents` 是原始请求关注事件次数，不是消息数；`weChatRedrawEvents`、`weChatWindowCreatedEvents` 仅作诊断。`processMetadataErrors` 表示部分窗口进程信息未能读取，可能涉及其他应用，不能据此断言微信没有提醒。

Windows 文档将 `RegisterShellHookWindow` 标为非通用接口，未来版本可能变化。应按 Windows/微信版本重新验证；监听失败时岛屿显示错误并重试，不宣称已取得聊天内容。

## 本机验证（2026-10-19）

全新应用数据和安装包内程序的真实提醒验收，见 [首次使用消息接收验收](notification-first-run-verification.md)。该验收没有重置 Windows 账户或客户端设置。

用户在接收真实消息后确认任务栏微信图标闪动。首次 120 秒只读探测捕获 4 次微信请求关注、4 次重绘和 1 次窗口创建事件，进程元数据错误为 0，未读取聊天文本。用户确认首版先采用仅提醒的范围。

用户在新版岛屿中开启微信提醒后，接收真实消息并确认“微信有新提醒”的折叠预览和绿色提醒点均出现。该验证由用户手动完成，代理未操控微信界面。

用户在修正版中确认点击「打开微信」直接切换到原来已登录的微信窗口。该动作不再启动额外的微信进程。

与正式功能共用的原生接收模块在后续 120 秒探测中捕获 12 次微信请求关注、3 次前台激活、13 次重绘和 2 次窗口创建，元数据错误为 0。窗口激活只能说明微信获得关注，不证明聊天已读。

逻辑测试覆盖重复闪动合并、前台关注清除、禁用时清空状态、旧监听事件被拒绝、重绘/窗口创建不触发消息提醒，以及打开动作优先选择已运行主窗口。完整 Rust 测试通过 16 项，另有真实 QQ 通知和本机微信窗口检测的 2 项测试默认忽略；本机只读窗口选择测试已单独执行通过，未启动或激活微信。QQ 预览计时的 3 项 Node 测试通过。

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --lib wechat_reminders::tests::finds_existing_wechat_main_window_without_launching -- --ignored --exact
node --test tests/unit/qq-notification-timing.test.mjs
pnpm build
pnpm tauri build --no-bundle
```

前端和桌面 release 构建通过。后台渲染检查覆盖微信待关注、默认关闭、错误状态，以及 QQ 的 20 条长文本通知；面板没有横向溢出，QQ 列表可滚动。边缘收起与托盘隐藏行为沿用已有状态和可见性保护，未另行操控桌面进行验收。

## 窗口唤回修复（2026-10-19）

2026-10-19 白屏修复：用户反馈直接唤回后的微信客户端白屏，而双击系统托盘可正常显示。直接恢复 HWND 的本机测试虽通过可见性检查，用户仍确认白屏，因此不能把窗口可见当作渲染成功。改用注册协议后，用户确认聊天界面恢复正常，本机进程检查仍为原主实例。对应集成测试连续唤回两次，验证恢复窗口仍属于原主进程；该测试不读取或比对聊天画面。

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib wechat_reminders::tests::window_activation_reuses_the_existing_wechat_process -- --ignored --exact
```

## 微信正文只读探测（尚未接入应用）

本机微信版本为 `4.1.9.35`。2026-10-19 的 Windows 通知快照和随后 30 秒观察均没有发现微信通知记录；这只说明本次未取得通知正文，不能证明客户端永远不会发出系统通知。

辅助功能探测在微信最小化时仅取得 3 个窗口外壳控件，文本控件和列表项均为 0。需要展开微信主窗口后继续检查，当前不能据此判定展开状态下的正文可读性，也未将此通道用于正式消息接收。

以下工具仅输出应用标识、控件/文字数量，不输出、落盘聊天正文或操作微信窗口。辅助功能探测限制在指定的微信进程窗口，最多检查 512 个控件和 8 层深度，并设置调用超时。

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --example wechat_notification_probe -- --watch-seconds 30

$wechatProcess = Get-Process -Name Weixin,WeChat -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
cargo run --manifest-path src-tauri/Cargo.toml --example wechat_accessibility_probe -- --window-handle $wechatProcess.MainWindowHandle
```

通知探测退出码 `2` 表示尚未验证到含正文的微信系统通知；辅助功能探测成功退出只代表检查完成，需同时核对 `windowMinimized`、`namedListItems`、`namedTextControls` 和 `bounded`，不能把窗口外壳当作可读取的聊天内容。

## 参考资料

- [Microsoft：RegisterShellHookWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registershellhookwindow)
- [Microsoft：Notification listener](https://learn.microsoft.com/en-us/windows/uwp/design/shell/tiles-and-notifications/notification-listener)
- [Microsoft：UI Automation Clients Overview](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-clientsoverview)
- [QQ 通知接入与修复](qq-notification-compatibility.md)
