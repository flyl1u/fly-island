# 首次使用消息接收验收（2026-10-19）

当前代码在本机的**全新应用数据**和 **NSIS 安装包内实际可执行文件**两种测试中，均自动开启 QQ、微信监听，并接收到新的真实事件。第一轮用户确认「已发送，两者都有提醒」，期间没有进入岛屿设置开启监听。

这证明当前构建在已满足系统和客户端通知条件的本机上，可以首次启动自动接收；尚不能保证任意新 Windows 用户都能全程无提示使用。公开下载包也尚未更新。

## 测试环境与隔离方式

- Windows 11 家庭中文版，版本 `10.0.22631`，构建 `22631.4460`。
- QQ 资源版本 `9.9.28-46494`，启动器文件版本 `9.9.20.37625`；微信 `4.1.9.35`。
- 用户保持两款客户端在后台登录，从其他设备发送真实测试消息。代理没有发送聊天消息或修改客户端设置。
- 每轮生成新的运行标识，启动前确认对应原生应用数据目录和 WebView2 目录不存在。通过独立应用标识和 `WEBVIEW2_USER_DATA_FOLDER` 隔离两类数据，避免沿用原应用的 localStorage 开关或授权请求标记。
- 测试使用现有 Windows 账户。没有重置系统通知权限、QQ 发送者注册、客户端设置或系统通知策略，因此不等于全新 Windows 账户测试。
- 诊断记录只含启用状态、连接状态、计数、时间和运行路径，不保存联系人或聊天正文。普通启动不启用诊断记录。

## 实测结果

时间为北京时间。就绪耗时从原生诊断线程启动时计算，记录采样间隔为 500 毫秒。

| 运行标识 | 来源 | 两项监听均就绪 | QQ 新通知 | 微信请求关注 | 画面确认 |
| --- | --- | --- | --- | --- | --- |
| `1779856af2854b11af5b75d85d63983d` | release 可执行文件，19:09:12 | 1009 毫秒 | 已记录 | 已记录 | 用户确认两者都有提醒 |
| `44bfb927c578479c8cd3932434bc64e9` | NSIS 包内程序，19:11:24 | 1030 毫秒 | 已记录 | 已记录 | 用户反馈误关闭，要求重新启动；不计作画面确认 |
| `f3058ad5121c46839547ec786119e2a5` | NSIS 包内程序重新隔离启动，19:12:30 | 1010 毫秒 | 已记录 | 已记录 | 原生日志通过，未另取得用户画面确认 |

三轮报告中的全新 WebView2 数据、独立原生数据、QQ 默认启用、微信默认启用均为 `true`。QQ 启动基线不重放，验收记录的数量来自监听后新进入岛内缓冲区的通知。微信记录的是客户端任务栏请求关注事件，不等同于聊天正文或准确消息数量。

完整本地报告保存在 `src-tauri/target/first-run-verification/<运行标识>/verification.json`，测试目录由 Git 忽略。自动验收完成后结束临时副本；测试前若已有正式程序运行，脚本会恢复正式程序。

## 安装包与公开下载检查

`pnpm tauri build` 已成功生成 NSIS 和 MSI。本次运行验收覆盖从 NSIS 提取的实际程序；没有在空白 Windows 系统中执行完整安装流程，也没有运行 MSI 安装测试。

| 本地构建产物 | SHA-256 |
| --- | --- |
| `target/release/focusd-island.exe` | `345DC1C929D70D7619348B9F5E6EBF33C18864C11ADA8F85A5BBD4C873B2C0E7` |
| `target/release/bundle/nsis/fly-island_0.2.4_x64-setup.exe` | `88EB8D1CF2DCA000F4941567AB97F04E61285F5C65B65EBAC962FD3B92CED199` |
| NSIS 中的 `focusd-island.exe` | `CE99F7358D84BCED7C092A9318F94DA4021B7156001348A59BA910FC8EDFA2F5` |
| `target/release/bundle/msi/fly-island_0.2.4_x64_en-US.msi` | `E84B82CB6874A037C74AA2751A367F8AE9E75B2F1FEBA9748D81B1D31DE8B516` |

以上路径相对于 `src-tauri/`。打包后的程序与直接构建程序哈希不同，因此单独验收了 NSIS 内的程序，不能将两者视为相同字节。

检查时 [GitHub 最新公开版本仍为 v0.2.4](https://github.com/flyl1u/fly-island/releases/tag/v0.2.4)，发布于 2026-09-26，对应 `def8de9`。仓库提交记录确认 QQ、微信及默认开启逻辑均在该标签之后加入。公开 NSIS 文件 `FocuSD.Island_0.2.4_x64-setup.exe` 的 SHA-256 为 `B3E5638986856723A435D911407C7FDE83A5BE5890D7B34A83A51AADD6F145E0`，不是本次验收构建。

本地验收构建暂沿用 `0.2.4` 版本号，**未发布，也未替换公开资源**。需要发布包含当前功能的新版本，首次从公开渠道下载的用户才会拿到这些改动。

## 可以承诺的范围与待验证项

- 岛屿首次启动会自动开启两项监听；用户主动关闭的选择在重启后保留，旧数据中的明确关闭选择也不覆盖。
- QQ 需要本机登录并实际发出 Windows 系统通知。程序自动检查通知通道，只有缺失发送者记录时才尝试内嵌修复；不会将关闭通知或策略禁止误当作缺失记录。
- Windows 如要求通知访问授权，仍需用户同意；拒绝后须到系统设置恢复。该限制来自 [Microsoft 通知监听器权限要求](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener#request-access-to-the-listener)，不能承诺所有设备首次使用都无提示。
- 微信无需通知访问授权，但必须实际发出任务栏请求关注事件。本机已接收；其他微信版本、仅托盘隐藏时的行为以及静音或免打扰组合尚未逐项覆盖。
- 尚未在全新 Windows 账户验证首次授权，也未人为删除正常 QQ 通知注册来测试自动修复。此类场景不纳入本次通过结论。

## 复测

先构建，再运行验收脚本；脚本只复制构建产物，不代替构建。

```powershell
pnpm tauri build
powershell -NoProfile -File scripts/verify-first-run-notifications.ps1 -ObservationSeconds 180
```

启动后保持 QQ、微信后台登录，不操作岛屿设置，从另一设备分别发送一条新消息，并人工确认岛上显示。脚本同时要求默认开启、连接成功、两类真实事件和数据隔离都通过，否则保存报告并返回失败。仅有监听状态正常不能判定接收验收通过。

验收安装包中的程序时，可先提取 `focusd-island.exe`，再传入该文件路径：

```powershell
powershell -NoProfile -File scripts/verify-first-run-notifications.ps1 -ObservationSeconds 180 -ExecutablePath 'D:\path\to\extracted\focusd-island.exe'
```

脚本开启的诊断模式仅用于验收，不增加正式功能的授权。临时应用标识必须带有效的独立运行标识，诊断才会记录；单轮最长五分钟。

相关机制和既有验证见 [QQ 接入与修复](../qq-notification-compatibility.md)、[微信提醒](../wechat-reminder-compatibility.md)。

## 本次检查

- `pnpm tauri build`：前端、Rust release、NSIS、MSI 构建成功。
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`：30 项通过，4 项真实会话集成检查默认忽略；真实消息接收由上述桌面程序验收覆盖，不把忽略项算作通过。
- PowerShell 脚本语法解析通过；安装包程序的本地报告满足脚本全部通过条件。
- 桌面 `fly-island.lnk` 已重新读取验证，目标、工作目录、图标均指向本仓库 release 程序；正式程序已重新启动。
