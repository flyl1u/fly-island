# 钉钉消息内容读取调研与方案

> 调研日期：2026-11-20。本文只记录可行性、风险和实施计划，不改变当前钉钉、飞书、企业微信的实现。

## 现状与目标

`src-tauri/src/office_im/` 目前把钉钉、飞书和企业微信统一当作任务栏提醒来源：`listener.rs` 注册 Shell Hook，收到 `HSHELL_FLASH` 后更新 `OfficeImSnapshot`；`desktop.rs` 通过进程名和窗口类名找到主窗口，`open_office_im` 负责唤回。前端 `src/features/messages/office-im/OfficeImPanel.tsx` 只显示一张无内容的「新提醒」卡，点击后回到对应客户端。现有设置文案也明确写着不会读取消息文本。

钉钉显示具体消息需要增加一个独立的“内容来源”，同时保留现在的任务栏闪动和唤回行为。内容来源失败、权限未授予或钉钉没有发系统通知时，应继续显示当前的通用提醒，而不能阻断提醒或改变唤回路径。

## Fuyu 的实现调查

我查看了 [TixXin/Fuyu](https://github.com/TixXin/Fuyu) 在 commit `6b3581934eb1f2a9c642bf8934ff7ab6f3c63224` 的仓库。它没有钉钉专用的 UI Automation 会话列表读取、钉钉本地数据库解析或进程内存 Hook，采用的是通用 Windows Toast 路线：

- `src-tauri/src/im_sources/specs.rs` 为钉钉配置应用显示名/AUMID、`DingTalk.exe` 和 `dingtalk` 协议，使通用来源可以归属到钉钉。
- `src-tauri/src/toast_notifications/poller.rs` 调用 `UserNotificationListener.GetNotificationsAsync`，读取通知的 `AppInfo` 和 `ToastGeneric` 文本；`cache.rs` 缓存 AppInfo，减少重复的跨进程查询。
- `src-tauri/src/im_sources/windows.rs` 负责 Toast 轮询和任务栏闪动兜底。`state.rs` 把 Toast 的第一段文本作为标题、剩余文本作为正文，并与闪动提醒合并、去重。
- `src/features/messages/im-sources/ImNotificationPanel.tsx` 将标题和正文显示在消息面板中。
- Fuyu 的 `StandardFrame_DingTalk`、Qt 主窗口类等代码只用于识别和唤回钉钉窗口，不能证明它能从窗口读取会话内容。

Fuyu 使用 AGPL-3.0；本仓库使用 GPL-3.0。方案只借鉴 Windows 公开 API、数据分层和失败回退思路，不复制 Fuyu 的代码、命名或实现片段。若未来需要引用其代码，必须先由维护者确认许可证义务和兼容性。

## 技术路线比较

| 路线 | 能拿到的内容 | 稳定性与版本脆弱性 | 权限、隐私与性能 | 实机验证与对现有行为的影响 |
| --- | --- | --- | --- | --- |
| UI Automation 读取会话列表 | 若无障碍树暴露完整列表，可拿到联系人/群名、行摘要、未读数、@我标记，类似微信；一般只能看到当前已渲染的行 | 钉钉新主窗口是 `StandardFrame_DingTalk`，同时存在 Qt 类窗口，内部页面可能是 Chromium/CEF/WebView。是否暴露稳定的 ListItem、AutomationId 和 Name 需要按版本实测；虚拟化、换肤、DOM/CEF 更新会使选择器和文本格式失效 | 通常不需要管理员权限，但会读取聊天内容；轮询 UIA 有跨进程调用和 COM 开销，钉钉切换页面或列表滚动时可能阻塞；不应写入磁盘 | 用 Inspect.exe/UIA Verify 检查新旧钉钉、窗口最小化/托盘、群聊和单聊。建议作为后续实验；实现时与 `desktop::open`、Shell Hook 分离，失败只回退到通用提醒，不改唤回行为 |
| Windows Toast / `UserNotificationListener` | 通常可拿到发送人或会话标题、Toast 正文、时间、应用身份和通知 id；有些通知只给“钉钉有新消息”或被系统截断 | 使用 Windows 的公开通知抽象，比依赖钉钉 UI 结构更稳；钉钉版本、通知模板、语言、企业策略、专注助手和用户关闭通知都会改变字段，不能保证每条消息都有正文 | 需要用户授予通知访问权限（先查询 `UserNotificationListenerAccessStatus`，按需请求）；内容在本机内存去重，不落盘。按短周期轮询或事件驱动的成本低于 UIA | 覆盖直接消息、群聊、@我、图片/文件/会议、通知关闭、专注助手、托盘、多个钉钉版本。作为推荐的一期新增来源；任务栏闪动仍是兜底，现有点击唤回不变 |
| Windows 通知中心数据库 | 理论上可以从历史通知表拿到标题、正文、应用身份和时间，可能比实时 Toast 留得更久 | 数据库路径、表结构和保留策略不是稳定契约；Windows 更新、权限、应用打包方式和数据库锁都会破坏读取，不能依赖 | 直接读取通知数据库会接触所有应用的通知，隐私范围大；可能需要额外权限，SQLite 锁和频繁扫描也有明显开销 | 仅做只读探测，不纳入产品实现。验证是否能在目标 Windows 版本获得钉钉记录；不影响当前任务栏监听，但失败回退复杂、维护成本高 |
| 进程/内存 Hook、注入或钉钉本地数据库 | 可能得到完整会话、发送人和未读状态，甚至能支持点击定位 | 对内部协议、加密、版本和反作弊策略高度敏感；升级后最容易崩溃或读错，维护成本和安全风险最高。Fuyu 调查未发现这条路线 | 需要高权限或向第三方进程注入，可能触发安全软件、钉钉风控和账号限制；性能和故障影响不可控 | 不建议验证或实现；会改变现有“只监听并唤回”的边界，必须排除 |
| 钉钉开放平台/机器人 API | 可获得企业机器人或服务端订阅的消息，不等于当前桌面账号收到的私聊/群聊 | 依赖企业管理员、应用创建和服务端回调，桌面端登录态与开放平台消息不一定一致 | 需要网络、凭据和企业授权，数据离开本机；远超当前消息提醒范围 | 不纳入本需求；会引入账号和网络配置，无法作为桌面端无配置的回退 |

### UI Automation 的特别判断

钉钉不能简单按“Chromium 一定读不到”或“Qt 一定能读到”判断。`StandardFrame_DingTalk` 只说明顶层窗口框架；嵌入的 WebView/CEF 是否向 UIA 提供可用的 Name、AutomationId、SelectionItem 和虚拟化列表，需要在真实版本上观察。若能读到，会话行摘要也可能是“最后一条消息”而不是 Toast 的完整正文，且未读数与任务栏闪动之间没有稳定的一一对应关系。因此 UIA 适合做实验性增强，不适合成为第一版唯一来源。

## 推荐方案

> 本仓库已有同一条路线的实现：QQ 通知就是用 `UserNotificationListener` 读系统 Toast 的（`src-tauri/src/qq_notifications/listener.rs`、`mod.rs`，权限申请、轮询与去重、只存内存都已在用）。钉钉的 Toast 读取应抽出并复用这套监听，按应用身份分发给 QQ 和钉钉，而不是另起一个轮询器；同时读两个应用也只有一次 `GetNotificationsAsync`。

推荐“Windows Toast 优先，任务栏闪动兜底”，先支持钉钉，之后再评估是否复用到飞书和企业微信：

1. 在现有 Shell Hook 旁增加 Toast 轮询器，只接收允许的 DingTalk AUMID/应用身份。以通知 id、时间、标题和正文哈希去重，并把第一段作为发送人/会话标题、剩余文本作为消息正文；通知内容只放在本次运行的内存中。
2. Toast 到达时更新同一个 office-im 状态；如果任务栏先闪动，则先创建通用提醒，随后 Toast 到达时补充正文；如果 Toast 不可用或字段为空，保留当前无内容提醒。`desktop::open`、窗口类识别和 `open_office_im` 完全沿用，不通过读取器唤起或激活钉钉。
3. 通过设置项控制“显示钉钉消息内容”，默认关闭或按现有消息隐私策略决定默认值；关闭后仍监听任务栏闪动，但不读取或显示 Toast 正文。首次需要 Toast 访问权限时，显示中英文说明和系统设置入口，拒绝权限不影响通用提醒。
4. 一期稳定后，再以实验开关验证 UIA：只读当前可见会话行，不注入钉钉进程、不改窗口状态；只要 UIA 解析失败，就逐条回退到 Toast/通用提醒。

## 建议的代码落点（实施时）

这些是后续实现的落点，本次调研不修改它们：

- Rust：在 `src-tauri/src/office_im/` 新增 `toast_listener.rs`（WinRT 监听、AUMID 过滤、文本解析和去重），将内容状态放进 `mod.rs` 的 `OfficeImSnapshot`。保留 `listener.rs` 的 Shell Hook 和 `desktop.rs` 的唤回逻辑；必要时把通用的通知轮询抽到同目录的明确模块，不新建无领域的 helpers 文件。
- Tauri 命令：优先扩展现有 `get_office_im_state`、`clear_office_im` 和 `open_office_im` 返回/清理内容；新增一个明确的 `set_office_im_message_preview_enabled(client, enabled)`（或只针对钉钉的同等命令）和 `request_windows_notification_access`，不要改变现有命令名和参数含义。
- 前端：`src/features/messages/office-im/api.ts` 扩展快照类型，`useOfficeIm.ts` 复用现有事件订阅、`attentionListeners` 和去重逻辑，`OfficeImPanel.tsx` 复用 WeChat 使用的 `MessageCard`/`useMessageCardExit`，`messagePreview.ts` 继续使用 `title`/`body`。不要为钉钉另造一套卡片或唤回流程。
- 设置与文案：`src/windows/settings/OfficeImSettingsGroup.tsx` 增加消息内容开关和权限状态；在 `src/i18n/sections/settings/plugins.ts`、`src/i18n/sections/messages.ts` 增加中英文的“只在本机内存读取钉钉 Toast、权限可随时关闭、无 Toast 时仍有通用提醒”说明。窄窗口下使用现有 `SettingsToggleRow` 和短标签。
- 架构记录：实现完成后再按 `docs/architecture/overview.md` 的目标结构补充 office-im 的 Toast 子模块、数据流和权限边界；同时更新 `docs/architecture/contracts.md` 中新增命令、事件和快照字段。

## 分步实施计划

### 第 0 步：真机能力矩阵

在至少两个钉钉版本、Windows 10/11 和中英文界面上记录：AUMID/显示名、通知访问状态、Toast 文本结构、通知 id 是否稳定、窗口类名、托盘/最小化状态、专注助手和钉钉内通知开关。只记录结构化测试结果，不保存真实聊天正文。

### 第 1 步：Toast 读取与状态合并

新增纯逻辑解析器和内存去重缓存；先写 Rust 单元测试覆盖 AUMID 过滤、标题/正文拆分、重复 Toast、过期通知和权限拒绝。把 Toast 内容和 Shell Hook 的 `Attention` 合并到同一条 office-im 事件，保持 `FLASH_QUIET_MS` 的合并语义。

### 第 2 步：前端展示与设置

扩展 office-im 快照增加可选消息列表、来源时间和内容状态；复用现有消息卡和消息页布局。增加钉钉内容开关、权限状态、清除内容命令和中英文文案；Toast 内容为空时继续显示 `newReminder`，不制造空标题卡片。

### 第 3 步：回归与 UIA 实验

新增 `tests/unit/` 的解析和状态测试、office-im 回归页 fixture，运行 `pnpm check`、`pnpm build` 和 `pnpm test:regression`；Rust 运行 `cargo test` 与 clippy。之后用独立实验开关验证 UIA，不把实验结果作为 Toast 方案的前置条件。

## 测试与真机验收清单

- Toast 权限允许、拒绝、系统通知关闭、专注助手开启时，状态和中英文错误提示正确；权限拒绝仍有任务栏通用提醒。
- 单聊、群聊、@我、免打扰、图片/文件/会议卡片、连续多条消息和同一通知重复投递分别验证发送人、正文、时间和去重。
- 钉钉最小化、关闭到托盘、窗口隐藏、多个钉钉进程、旧 Qt 窗口和 `StandardFrame_DingTalk` 同时存在时，点击提醒仍回到正确主窗口；不为读取内容主动唤起或激活钉钉。
- Toast 与闪动先后顺序互换时只出现一条提醒；Toast 永远不到达时行为与当前版本一致；打开/清除后不会在下一次启动重放上次内容。
- 内容只存在内存，设置关闭后立即清空；不读取通知数据库、不注入钉钉进程，不把真实消息写入日志或回归 fixture。

## 风险与回退

主要风险是钉钉不发送包含正文的 Toast、Windows 通知访问权限不可用、通知模板随版本变化，以及系统通知中混入其他钉钉账户。每一项都应通过 AUMID/进程归属、字段校验和去重保护；解析失败直接降级到现有通用提醒。实现应保留一个总开关和清除缓存命令，出现崩溃、误归属或隐私投诉时可关闭内容读取而不影响任务栏监听和“点击回到钉钉”。
