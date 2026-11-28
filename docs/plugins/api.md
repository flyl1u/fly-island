# API v1：协议与扩展点 / Protocol and extension points

> **先看[插件开发规范](README.md)。** 本文是小岛内部已有的「外部数据接入」机制（把其他 AI 工具的额度、会话、消息接进 Agent 页，外部进程 + JSON-RPC）的技术说明，**不是插件的定义**。插件是对小岛源码的改造，只有当你的插件需要接入外部数据源时才需要参考本文。
>
> **Read the [plugin guide](README.md) first.** This page documents the island's existing external data adapter mechanism (an external process over JSON-RPC that feeds quota, sessions and messages into the Agent page). It is **not the definition of a plugin**: plugins change the island's source. Refer to it only if your plugin needs an external data source.

[总览 / Overview](README.md) · [Manifest 与安全 / Manifest and security](specification.md) · [快速开始 / Quickstart](quickstart.md)

规范以 [protocol.rs](../../src-tauri/src/plugin_host/protocol.rs)、[process.rs](../../src-tauri/src/plugin_host/process.rs)、[service.rs](../../src-tauri/src/plugin_host/service.rs) 和 [SDK](../../plugins/sdk/src/lib.rs) 为准；扩展对象拒绝未知字段。v1 不支持插件请求宿主 API、任意 RPC 方法、JSON-RPC batch、自定义 UI 或增量补丁。

The linked implementation defines the contract. Unknown contribution fields are rejected. v1 has no plugin-initiated host API calls, arbitrary RPC methods, JSON-RPC batches, custom UI or incremental patches.

## 传输与生命周期 / Transport and lifecycle

stdin/stdout 使用无 BOM 的 UTF-8，每行一个 JSON-RPC 2.0 对象，行末换行并 flush，不要格式化成多行。**stdout 只用于协议**，日志写 stderr，禁止敏感信息。宿主与 SDK 输入每行最多 256 KiB（包括实际写出的换行，应留封装余量）。只用 JSON 标准数值，不能发送 NaN/Infinity。

Use UTF-8 without a BOM, one JSON-RPC 2.0 object per newline, flushing after each line. Do not pretty-print across lines. **Reserve stdout for protocol**; diagnostics go to stderr without secrets. Host/SDK input lines are limited to 256 KiB including transmitted newlines; leave envelope headroom. Only standard JSON numbers are allowed, never NaN/Infinity.

| 方向 / Direction | 方法 / Method | 参数与返回 / Parameters and response |
| --- | --- | --- |
| 宿主 → 插件 / Host → plugin | `initialize` request | `params: {apiVersion: 1, settings: object}`；`result: {apiVersion: 1}`，10 秒内 / within 10 seconds |
| 宿主 → 插件 / Host → plugin | `action` request | `params: {id: string}`；同请求 id 的 JSON result 或 error，15 秒内 / matching request ID and JSON result or error within 15 seconds |
| 插件 → 宿主 / Plugin → host | `publish` notification | 无 RPC id，params 为完整 `Contributions`；宿主不响应 / no RPC ID, complete `Contributions`, no response |
| 宿主 → 插件 / Host → plugin | `shutdown` notification | `params: {}`；无需响应，清理并退出 / no response; clean up and exit |

### 初始化 / Initialize

```json
{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"apiVersion":1,"settings":{"interval":"60","api_key":""}}}
{"jsonrpc":"2.0","id":0,"result":{"apiVersion":1}}
```

以上为先后两条单行消息，不是数组。宿主请求 id 是整数：initialize 固定 0，action 从 1 递增，每次进程重启重新开始。只有握手成功后才能 publish。settings 含清单每个设置的默认/已保存有效值，包括 secret；不要记录整个对象。**没有 locale、语言变更、主题、窗口状态或游戏模式字段**；动态文案限制见[设计指南](design.md)。

These are successive single-line messages, not an array. Integer request IDs use 0 for initialize and increment from 1 for actions, resetting per process. Publish only after successful initialization. Settings includes every setting's effective default/saved value, including secrets; never log it. **No locale, language-change, theme, window-state or game-mode fields are supplied**; see [design integration](design.md).

设置变更重启插件。启用时无控制台启动，工作目录为插件目录。初始化失败、输出关闭、进程退出或协议错误触发最多 6 次重启，依次等待 1、2、4、8、16、32 秒；曾成功握手不会重置重试计数。耗尽后显示 failed，重新开关可重试。starting/running/restarting/stopped/failed 由宿主翻译显示，不是插件 publish 的字段。

Settings changes restart the process. Enabled plugins start without a console, using their directory as working directory. Initialization failure, closed output, exit or protocol errors trigger at most six restarts after 1, 2, 4, 8, 16 and 32 seconds. Successful handshakes do not reset the counter. Exhaustion yields failed; toggling enable can retry. The host localizes starting/running/restarting/stopped/failed; plugins do not publish these fields.

停止时宿主尽力发送 shutdown，最多等 3 秒，再 kill/wait 并用 Windows Job Object 清理进程树；错误退出路径不保证先发 shutdown。必须同时处理 stdin EOF，SDK run 返回后自己取消后台任务。stderr 单文件超过约 1 MiB 时清空再写；在 8192 字节块内读不到完整换行的长行/未终止行丢弃，已知 secret 替换为 `[redacted]`，不能代替插件自身脱敏。

On stop the host attempts shutdown, waits up to three seconds, then kills/waits and cleans the process tree via a Windows Job Object. Error exits need not send shutdown: also handle stdin EOF and cancel owned work when SDK run returns. A stderr log is cleared after it exceeds roughly 1 MiB. Oversized/unterminated lines without a complete newline within an 8192-byte read are dropped. Known secrets become `[redacted]`; plugins must still sanitize diagnostics.

### 用户动作 / User actions

```json
{"jsonrpc":"2.0","id":1,"method":"action","params":{"id":"open-session-42"}}
{"jsonrpc":"2.0","id":1,"result":true}
```

失败时只发送 error，不同时发 result：

For failure send error instead of result:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"Action failed"}}
```

清单 actions 生成设置页按钮；会话/消息 action 是插件选择的不透明字符串，必须在最近一次快照中仍存在。宿主仅允许这两类已知动作，传给插件的参数**只有 id**，不传路径、会话对象或其他 payload。插件在自身内存中映射 id 到安全目标，不把 id 当 shell 命令/任意 URL。无 action 的条目可展示但不能跳转。result 只完成调用，不更新设置或快照；需另行 publish。宿主不直接展示插件 error.message；SDK 将 action 错误归一为上述通用响应。

Manifest actions create settings buttons. Session/message actions are opaque strings chosen by the plugin and must remain in its latest snapshot. Only manifest or current session/message actions are allowed. The host sends **only the action ID**, no path, object or extra payload. Keep a validated ID-to-target mapping inside the process; never interpret IDs as shell commands or arbitrary URLs. Entries without actions display but cannot navigate. A result completes the call without updating settings/snapshots; publish separately. The host does not surface plugin error.message directly; the SDK normalizes action failures to the generic response above.

长时间登录异步启动并立即返回，网络请求有超时。SDK poll/action 在同一个循环中执行，阻塞 poll 同样阻塞下一条 action/shutdown；耗时工作放到可取消 worker，poll 只读缓存。

Start long sign-in work asynchronously and respond immediately; bound network timeouts. SDK poll/action share one loop, so blocking poll also delays action/shutdown. Use cancellable workers for long work and return cached data from poll.

## 完整快照 / Complete snapshot

```json
{"jsonrpc":"2.0","method":"publish","params":{"quota":[{"id":"account","label":"Example","remainingPercent":75,"secondaryPercent":50,"balance":null,"resetsAt":1800003600000,"updatedAt":1800000000000}],"sessions":[{"id":"session-42","title":"Review changes","cwd":"D:/work/demo","status":"running","updatedAt":1800000000000,"action":"open-session-42"}],"notifications":[{"id":"message-7","sourceId":"team","appName":"Example","icon":"plugin","title":"Review ready","body":"The requested review is complete.","receivedAt":1800000000000,"action":null}]}}
```

示例请换成真实时间与数据。每次 publish **替换本插件全部三个数组**；缺省数组等于空数组，不是「保持旧值」。需保留的会话与消息也要发出。清空用 `{"quota":[],"sessions":[],"notifications":[]}`。非空数组必须在 manifest.contributes 与 permissions 中声明。各插件快照相互独立。

Replace example times/data with real values. Every publish **replaces all three arrays for this plugin**; omitted arrays mean empty, not unchanged. Include sessions/messages that should remain visible. Empty all three to clear. Nonempty arrays require matching contributions and permissions. Each plugin has its own snapshot.

所有扩展对象拒绝未知字段。下表 `?` 为允许 null 或省略的 Option 字段，建议显式发 null，其余字段必填。文本纯文本、每字段最多 4096 UTF-8 字节且无 NUL；每数组内 id 非空且唯一（不套用 manifest id 正则）。时间为带符号 64 位 Unix **毫秒**；宿主不自动修正秒或保证时间合理，必须保留真实事件时间。不发布凭据、请求头、完整 transcript 或伪造成功。

Contribution objects reject unknown fields. `?` below means an Option field accepting null or omission; explicit null is recommended. All other fields are required. Text is plain text, ≤4096 UTF-8 bytes per field, without NUL. IDs are nonempty and unique per array; the manifest-ID regex does not apply. Times are signed 64-bit Unix **milliseconds**; the host neither converts seconds nor ensures plausible dates. Preserve real event times. Never publish secrets, headers, full transcripts or fabricated success.

### Quota：最多 32 条 / Up to 32 entries

| 字段 / Field | 类型 / Type | 语义 / Meaning |
| --- | --- | --- |
| `id` | string | 稳定账号/窗口标识 / Stable account or quota-window identity |
| `label` | string | 简短服务名或额度名 / Short service or quota name |
| `remainingPercent` | number? | 外环剩余，有限 0–100 / Outer-ring remaining percentage, finite 0–100 |
| `secondaryPercent` | number? | 内环剩余，有限 0–100 / Inner-ring remaining percentage, finite 0–100 |
| `balance` | string? | 格式化金额/积分，含币种/单位 / Formatted balance/credits with currency/unit |
| `resetsAt` | i64? | 重置时间，未知用 null / Reset time or null |
| `updatedAt` | i64 | 数据真实更新时间 / Actual data update time |

宿主用同心环。balance 非 null 时优先作主数字，否则显示外环剩余或「–」。内环未知时显示 label，否则显示内环百分比。悬停/键盘卡片显示 label、非空 balance、未来的本地重置时间和图例；v1 不显示自定义说明或 updatedAt 文案，也不自动在重置时清除旧百分比，插件须刷新/置 null。读取失败不是剩余 0：保留仍有效缓存，或用 null/移除条目。

Concentric rings show balance first when nonnull, otherwise outer remaining percent or “–”. Unknown inner quota shows the label; otherwise the inner percent appears. Hover/keyboard cards show label, nonempty balance, future reset time in local format and a legend. v1 does not display custom descriptions or updatedAt copy, or clear percentages at reset; refresh or null them yourself. Read failure is not zero remaining: retain valid cache, use null or remove the entry.

### Sessions：最多 200 条 / Up to 200 entries

| 字段 / Field | 类型 / Type | 语义 / Meaning |
| --- | --- | --- |
| `id` | string | 稳定会话标识 / Stable session identity |
| `title` | string | 可识别的任务标题 / Recognizable task title |
| `cwd` | string? | 项目目录，未知 null / Project directory or null |
| `status` | string | 仅 `running`、`waiting`、`completed` / Only these three values |
| `updatedAt` | i64 | 最后真实活动时间 / Last real session activity |
| `action` | string? | 点击传回插件的动作 id / ID sent back on click |

宿主身份为 `<plugin-id>/<session-id>`，复用时间窗口筛选、排序、归档、已读、列表/卡片/紧凑模式、标题与折叠计数。仅启用且 live.status 为 running 时参与；历史文件不能每轮变成「刚完成」。waiting 不是工具审批 API。v1 没有 failed、model、effort、lastMessage、自定义图标或进度字段；当前来源名取 manifest.name.en，并非所有内置字段都能提供。

The adapter namespaces IDs as `<plugin-id>/<session-id>` and reuses time filtering, sorting, archive/read state, list/card/compact views, titles and collapsed counts. Only enabled plugins with running live status contribute. Never turn historical files into “just completed” sessions on each poll. waiting is not a tool-approval API. v1 has no failed/model/effort/lastMessage/custom-icon/progress fields; the current source name uses manifest.name.en. Plugins cannot supply every built-in field.

### Notifications：最多 100 条 / Up to 100 entries

| 字段 / Field | 类型 / Type | 语义 / Meaning |
| --- | --- | --- |
| `id` | string | 稳定事件 id，用于去重 / Stable event identity for deduplication |
| `sourceId` | string | 插件内来源/会话标识 / Source or conversation within the plugin |
| `appName` | string | 应用名称 / Application name |
| `icon` | string | `plugin`、`wework`、`dingtalk`、`feishu`；其他值回退 Puzzle / Other values fall back to Puzzle |
| `title` | string | 标题/会话名，空时回退 appName / Title/conversation, falls back to appName if empty |
| `body` | string | 简短消息摘要 / Short message summary |
| `receivedAt` | i64 | 实际收到时间，旧消息不能每轮重写 / Actual arrival time, never rewritten on polling |
| `action` | string? | 用户点击执行的动作 id / Action ID for a user click |

消息页用现有 MessageCard，按 receivedAt 倒序。折叠预览共用 latestMessagePreview 仲裁，插件事件后 **8 秒**过期（当前固定值，与其他来源可调停留时长不同）。企业 IM 用宿主字母色块，不接受图片/URL 图标。重复发布保留原 id 和时间，不能轮询制造提醒，见[设计指南](design.md)。

Messages use MessageCard sorted by receivedAt. Collapsed previews share latestMessagePreview arbitration and expire **8 seconds** after a plugin event (currently fixed, separate from other sources' configurable duration). Enterprise IM uses host letter badges, not image/URL icons. Republished messages keep their ID/time; never manufacture alerts on polling. See [design integration](design.md).

## Rust SDK / Rust SDK

任何语言的独立 exe 都可实现协议，但仓库构建发布脚本目前针对 Rust crate。推荐依赖 `fly-island-plugin-sdk = { path = "../sdk" }`。以下无需账号，没有数据时诚实返回空快照：

Any executable can implement the protocol, but repository build/release tooling currently targets Rust crates. Prefer the SDK dependency above. This minimal account-free implementation truthfully publishes an empty snapshot:

```rust
use fly_island_plugin_sdk::{empty, json, run};
use std::time::Duration;

fn main() {
    let result = run(Duration::from_secs(60),
        |_settings| Ok(empty()),
        |id, _settings| match id {
            "refresh" => Ok(json!(true)),
            _ => Err("Unknown action".into()),
        });
    if result.is_err() { std::process::exit(1); }
}
```

| SDK 函数 / Function | 行为 / Behavior |
| --- | --- |
| `run(interval,poll,action)` | 初始化、poll、action、shutdown/EOF；settings.interval 若为可解析整数字符串则覆盖 interval，夹到 1–3600 秒 / Initialize, poll, action, shutdown/EOF; a parseable integer-string settings.interval overrides interval, clamped to 1–3600 seconds |
| `empty()` / `now()` | 空三数组 / Unix 毫秒 / Empty three arrays / Unix milliseconds |
| `quota(id,label,percent,balance,reset)` | secondary 为 null、updatedAt 为 now，percent 夹到 0–100 / Null secondary, current updatedAt, clamped percentage |
| `session(id,title,cwd,status,updated,action)` | 使用传入真实时间 / Uses supplied real timestamp |
| `notification(id,source_id,app_name,icon,title,body,action)` | 每次取 now；重发须缓存对象或设置原时间 / Takes now each call; cache the object or restore original time on republish |
| `publish(data)` | 握手前不输出；去重、限制条数/文本/总大小，会话按时间排序；不代替宿主校验 / Silent before handshake; deduplicates/bounds output and sorts sessions by time; not a substitute for validation |
| `send(value)` | 序列化单行、flush，不自动校验边界 / Serializes and flushes a line without automatic bounds checks |
| `read_json(path,limit)` | 受限 JSON 文件读取 / Bounded JSON file reading |
| `file_timestamp(path)` / `timestamp_or_file(value,path)` | 文件修改时间；缺失时间回退文件时间，小的秒值转毫秒 / File mtime; fallback for missing times, small second values convert to milliseconds |
| `credentials::load/save` | 共享宿主凭据命名空间，见[安全规范](specification.md) / Shares host credential namespace; see security specification |

SDK 还提供 SHA-256、AES-GCM、DPAPI、Chromium v10 辅助函数，签名见源码；不授予额外权限。poll Err 会输出通用诊断并 publish 空快照，action 后立即再 poll；需要仍有效缓存时由插件显式返回。不要依赖自动截断满足资源审核或伪称完整历史。

The SDK also has SHA-256, AES-GCM, DPAPI and Chromium v10 helpers; see source for signatures. They grant no additional permissions. A poll error produces a generic diagnostic and empty snapshot; an action schedules an immediate poll. Return still-valid cache explicitly when needed. Automatic truncation does not replace bounded collection or justify claims of complete history.

## 本分支原生页面 / Native pages in this branch

manifest 声明 `panel` 权限、贡献与 `panel.icon` 后，publish 可带一个可空 `panel` 对象。旧 quota / sessions / notifications 契约保持兼容；未声明的 panel 被拒绝。宿主新增的是融入原有导航和设置的 React 页面，panel 数据不提供 HTML/CSS；护眼 0.2.0 的休息 WebView 由宿主按新版规范按需创建，见 [Eye Care](eye-care.md)。

| 字段 / Field | 约束 / Constraint |
| --- | --- |
| headline / note | 纯文本状态与可空说明 / Plain status and nullable note |
| rows | 最多 16 行 / At most 16 rows |
| row | id、title；detail 可空；percent 为 null 或 0–100；countdownTo 为 null 或正 Unix 毫秒；durationMs 为 null 或非负毫秒数（宿主原样显示的固定时长：暂停时的剩余时间或到期后的累计值，和 countdownTo 互斥，两者都给会被拒绝）；tone 为 normal / warning / danger |
| actions | 最多 4 个唯一的 manifest 已声明 id，只显示当前有效的阶段性动作 / At most 4 unique declared IDs for currently available actions |
| islandActions | `actions` 的子集（最多 4 个唯一 id），岛内页面只显示这些；省略或 null 表示全部显示。给自家窗口用的动作留在 `actions` / Subset of `actions` shown on the island page (at most 4 unique IDs); omitted or null shows all. Keep window-only actions in `actions` |
| attention | bool；点亮页按钮提示点，不弹通知 / Page-button indicator, no notification |

每次 publish 替换整个 panel；省略或 null 清空。文本最多 4096 UTF-8 字节且无 NUL，行 id 非空唯一。倒计时由宿主本地按秒更新，插件只提供期限与状态；`durationMs` 是宿主原样显示的固定时长（暂停时的剩余时间、到期后的累计值），不自行计时（护眼暂停时与「休息时间到」都这样），因此同样不需要每秒 publish。主进程只在快照变化时发送 plugins-changed；panel 的错误字段或动作使该 publish 被拒绝。无 panel 的旧适配器不受影响。

Every publish replaces the complete panel; omission/null clears it. Text is bounded to 4096 UTF-8 bytes without NUL and row IDs are unique/nonempty. The host ticks countdowns locally, publishes changes only when snapshots differ, and rejects undeclared/invalid fields or actions. `durationMs` is a fixed duration the host shows as it is instead of ticking it — a paused timer's remaining time or a finished round's total (Eye Care uses it for both) — so it needs no per-second publish. Legacy adapters without panels are unchanged.

Eye Care 0.2.0 的窗口是固定宿主源码接入，不是插件可指定的通用 URL/HTML 窗口。仅支持带完整休息动作与 desktop-windows 权限的 eye-care 清单；由 attention、timer 行截止时间和当前动作得到有界状态，snooze_10 表示本轮可推迟，skip 表示可跳过。宿主初始化时临时提供 `_host-eye-care-windows` 能力标记。通知模式到点、以及通知模式下手动「现在休息」都没有截止时间：attention 为真且 timer 行不带 countdownTo 时不开窗口，改为把岛屿展开到插件页并保持在最前面，直到插件动作清掉 attention。其他适配器不受影响。

Eye Care windows are a fixed host-source integration, not a general plugin-provided URL/HTML window. Supported manifests supply the timer deadline and current action availability; the host derives snooze/skip state, injects the transient capability marker and owns all presentation. Legacy adapters remain compatible.
