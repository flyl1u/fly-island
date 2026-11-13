# 微信提醒上岛

岛屿接收微信的任务栏提醒。启用消息摘要后，岛屿会尝试从电脑版微信的会话列表读取会话名和最新一条摘要。读不到摘要时显示「微信有新提醒」。

## 使用

1. 展开岛屿，点击右上角消息气泡。
2. 在 QQ、微信、邮箱共用的来源导航中选择「微信」，确认「接收微信提醒」已开启。接收提醒首次默认开启。要显示会话名和摘要，在「设置 → 消息 → 微信提醒」打开「显示联系人和消息内容」。
3. 保持电脑版微信登录、后台运行。当微信发出任务栏提醒时，折叠岛预览 5 秒，之后保留绿色提醒点。
4. 点击有内容的预览或摘要，岛屿会唤回微信并打开对应会话。普通提醒和微信图标打开主窗口。会话暂时找不到或被遮挡时，微信仍会打开，岛内消息页会显示提示。

微信页最多显示本次运行中读取到的 20 条摘要，每条来自相应会话的最新一条消息。群聊摘要沿用微信公开的原文，包含会话列表提供的发送者前缀。

打开动作先确认已有完整主窗口，再通过微信在 Windows 注册的 `weixin://` 入口将唤回请求交给客户端，等待原主进程的窗口恢复。窗口选择优先可见的完整主窗口，再选择较早启动的实例，忽略尺寸不足的登录和辅助窗口。未定位到原窗口时显示错误，提示先从系统托盘打开并登录微信。

该入口由微信自身管理显示和渲染状态，不再直接对微信调用 `ShowWindowAsync` 或窗口恢复命令，也不以无参数启动器打开新的登录窗口。未注册协议或未能恢复原窗口时明确报错，不退回强制显示隐藏窗口。

连续闪动合并为一次普通提醒。间隔一段时间后的新闪动可再次预览。已确认的新摘要会立即更新，提醒点亮着时也会接收后续消息。QQ 和微信预览重叠时优先显示最近到达的一项。

## 微信进程与路径判定

打开微信、打开会话、任务栏提醒监听和摘要读取共用 `wechat_reminders/source.rs` 的进程解析、窗口归属和主窗口选择规则：

- 微信正在运行时，以进程映像路径为准。可执行文件名为 `Weixin.exe` 或 `WeChat.exe` 即可，大小写不敏感，不要求与注册表记录的安装目录相等。
- 多个微信进程并存时，优先选择有完整主窗口的实例；多个主窗口中优先可见窗口，再选择较早启动的实例。只有登录或辅助窗口时，解析仍可取得运行路径，但打开动作仍要求已有完整主窗口。
- 未找到可读取映像路径的微信进程时，才回退注册表：依次检查 HKCU、HKLM 中 Weixin、WeChat 的安装及卸载信息，并验证 exe 存在。注册表路径作为未运行时的安装路径候选，不限制运行窗口的归属。
- 监听默认接收所有符合文件名的微信进程。摘要定期重新选择主窗口，并从该窗口所属进程读取 exe 路径；恢复辅助功能标志也按恢复记录中的 PID 和启动时间确认原进程，不沿用其他实例的安装路径。打开特定会话仍验证该摘要对应的 PID 和启动时间。
- 必须比较完整路径时（指定探测路径、校验辅助功能 DLL 归属），两边分别尝试 `canonicalize`，失败的一边回退到原路径，再统一大小写、斜杠和 `\\?\` 前缀；扩展 UNC 路径也统一为普通 UNC 形式。

以上规则覆盖 3.x 升级 4.x 后旧目录和注册表残留、3.x/4.x 并存、多开、便携版，以及通过 `mklink /J` 将安装目录迁往其他盘、注册表使用 8.3 短路径的情况。窗口归属只依赖运行进程的 exe 文件名；路径别名不再造成「未找到正在运行的微信窗口」误报。没有运行窗口、只有登录窗口或无法恢复主窗口时，原有错误提示保持不变。

## 消息摘要

「显示联系人和消息内容」默认关闭。启用后，岛屿尝试用 Windows UI Automation 读取会话列表。在需要公开控件树的微信 4.x 版本，岛屿校验正在运行的 `Weixin.dll` 后临时打开 Qt 的辅助功能标志。关掉摘要、关闭微信提醒或退出岛屿时恢复该标志。异常退出后的恢复记录只包含进程身份。

这项非官方功能会临时修改微信进程内存，可能影响客户端稳定性、在微信更新后失效，或触发账号限制。设置中的开关旁会显示风险。关闭摘要后仍可接收普通提醒。[腾讯服务协议](https://edu.tencent.com/agreement.html)

微信在后台时，岛屿会短暂等待任务栏提醒对应的列表更新，重试读取，比较未读和提及标记。微信当前选中的会话可能保持零未读，后台补读会暂存该会话的摘要变化，等任务栏闪烁确认后再显示。没有收到闪烁时，后台补读用未读和提及变化检测消息。读取暂时失败时保留上次成功的对照快照。同一会话短时间收到多条消息时，显示列表提供的最新一条。

将微信留在「聊天」页。开启摘要后，点窗口右上角「×」会将微信最小化并隐藏任务栏按钮，会话列表可继续读取，系统托盘仍可打开微信。岛屿通过辅助功能定位微信自己的关闭按钮，只处理该按钮的点击。若启动岛屿前微信已在系统托盘，需先打开一次微信。点「−」最小化时，可用独立开关「最小化时隐藏微信任务栏图标」控制任务栏按钮，该开关默认关闭。摘要只在本机内存中保留。

设置了「消息免打扰」的会话（会话列表的无障碍名称末尾带「消息免打扰」）只在有人 @我 时提醒；普通消息和「@所有人」都不提醒。任务栏闪烁后，如果会话列表里变化的只有这类免打扰会话，岛屿也不显示「微信有新提醒」。微信在系统托盘、会话列表读不到时无法判断来源，仍按普通提醒处理。2026-11-12 本机微信 4.x 实测：免打扰会话有新消息时名称里不出现未读条数，「消息免打扰」一行始终在。

实现方式参考 [Fuyu 的微信提醒](https://github.com/TixXin/Fuyu/blob/9074a6e2ea5ab6cdddc87338a2481ae454996211/docs/features/wechat-reminders.md)和 [wechatauto-replica 的 Qt 辅助功能指令特征](https://github.com/fanyuantaier/wechatauto-replica/blob/main/tools/wake_uia.py)。

## 为什么不使用 QQ 的通知来源

本机微信 `4.1.9.35` 的 Windows 通知记录中只发现分享扩展，尚未验证聊天系统通知。用户提供的「设置 → 通知」页面包含新消息通知声音、通话声音、发现页和朋友圈提醒，没有聊天横幅或系统通知开关。声音开关不能直接提供聊天内容，不能将没有系统通知简单归因于用户未开启声音。

本方案使用 Windows `RegisterShellHookWindow` 接收 `HSHELL_FLASH`，通过通知窗口所属进程映像的文件名识别微信，规则见上文。普通窗口创建和重绘不视为新提醒，其他应用事件被过滤。微信已在前台时不新增提醒。

任务栏请求关注可能来自聊天消息或其他微信提示。仅开启普通提醒时，岛屿依赖该事件。开启摘要后，岛屿还会在后台核对可访问会话的未读变化。

## 只读诊断

在仓库根目录执行：

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --example wechat_reminder_probe -- --watch-seconds 60
```

默认使用与岛屿相同的解析规则并监听所有微信实例。可用 `--exe` 指定其他已安装的 `Weixin.exe` 或 `WeChat.exe` 绝对路径，将本次监听限制到该路径；完整路径比较同样支持 canonicalize 和归一化回退。工具使用与岛屿相同的原生事件接收模块，不显示窗口、不操作微信、不改变设置。

开始监听前会输出 `phase: "executableResolution"`，包含 `registryExecutable`（注册表解析到的路径）、`runningExecutable`（按主窗口优先规则选出的运行进程路径）、`selectedExecutable`（最终采用的路径）和 `explicitExecutable`（`--exe` 参数）。缺失路径为 `null`，解析失败时仍先打印已取得的路径，方便比较旧安装记录与实际运行位置。路径诊断是瞬时快照，进程在探测期间退出或重启时可能变化。

- 退出码 `0`：观察到匹配的微信进程发出的任务栏请求关注事件。
- 退出码 `2`：本次没有验证到提醒；一次未捕获不能断定不兼容。`--watch-seconds 0` 仅检查注册和退出清理。
- 退出码 `1`：参数、安装路径或 Windows API 出错。

`weChatFlashEvents` 是原始请求关注事件次数，不是消息数；`weChatRedrawEvents`、`weChatWindowCreatedEvents` 仅作诊断。`processMetadataErrors` 表示部分窗口进程信息未能读取，可能涉及其他应用，不能据此断言微信没有提醒。

Windows 文档将 `RegisterShellHookWindow` 标为非通用接口，未来版本可能变化。应按 Windows/微信版本重新验证；监听失败时岛屿显示错误并重试，不宣称已取得聊天内容。

## 本机验证（2026-10-19）

全新应用数据和安装包内程序的真实提醒验收，见 [首次使用消息接收验收](investigations/notification-first-run-verification.md)。该验收没有重置 Windows 账户或客户端设置。

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

## 首版的微信正文只读探测（2026-10-19）

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
