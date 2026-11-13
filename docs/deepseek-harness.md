# DeepSeek Harness（DSH）桌面端接入

DSH 会话、宿主标识、余额环和来源开关接入 Agent 页。会话完全离线读取；余额是按需请求的官方账户数据。不会修改 DSH 配置、会话或凭据。

## 本地来源

2026-11-13 纠正：%APPDATA%/dsh-desktop/harness 是 DataElement 社区端的独立引擎根，不能称为“旧版官方端”。官方仓库有 Electron 桌面源码，但全部 38 个 GitHub Release 均无附件，未确认公开官方 Windows 安装包。本机是 DataElement DSH Desktop 0.12.1。

同时读取 DataElement 独立库、共享 ~/.dsh、anywhere Beta ~/.dsh-beta 和社区端保存的目录选择；按原始会话 ID 去重，保留最新检查点，不再要求 Desktop profile。共享库不能判断最初创建程序，按当前兼容宿主或通用 DSH 展示。

| 支持程序 / GitHub | Stars（2026-11-13） | Windows exe | 引擎数据 |
|---|---:|---|---|
| [官方源码 Desktop](https://github.com/deepseek-ai/deepseek-harness) | 279,782 | DeepSeek Harness.exe | ~/.dsh |
| [DataElement](https://github.com/dataelement/dsh-desktop) | 18,424 | DSH Desktop.exe | %APPDATA%/dsh-desktop/harness |
| [anywhere-labs Stable/Beta/NEXT](https://github.com/anywhere-labs/dsh-desktop) | 35,860 | DSH Desktop.exe / DSH Desktop Beta.exe / DSH NEXT.exe | ~/.dsh / ~/.dsh-beta；支持已保存绝对目录选择 |

目录选择只用于会话读取，不改变余额凭据来源。仅通过其他进程环境变量配置的任意目录不自动发现。完整源码依据、凭据、窗口和限制见 [调研记录](investigations/deepseek-harness-integration.md)。

| 文件 | 用途 |
|---|---|
| `sessions/<项目分片>/session-<UUID>/session.v3.jsonl.zstd`、`session.v4.jsonl.zstd` | 官方追加式、Zstandard 压缩 JSONL 会话日志。本接入只检查对应文件存在，不解压正文 |
| `storages/session_projcache/sessions/session-<UUID>.json` | 会话投影检查点，形如 `{version, record: {identity, rows: {<投影>: {ver, seq, val}}}}`；读取标题、初始目录、模型、最近一轮摘要、状态和上下文 token 数 |
| `profiles/web/desktop-storage.json` | 仅判断 `dsh.sessions.current` 中的 `sessionId`，避免 DSH 在前台时把所有会话都标记为已看过 |
| `.credentials.yaml` | 仅余额查询在进程内读取，详见下节 |

接受投影域版本 3–7、会话格式 3/4，按各投影的 `ver` 校验字段；未知版本、空白会话、已删除的源日志、超大或损坏文件安静跳过。每个检查点限 512 KiB，每次最多处理最新 512 个；按文件长度和修改时间缓存解析结果，缓存有容量上限。沿用 Agent 页的时间范围、排序、最多 12 条、隐藏已退出会话、归档和三种显示方式。

状态判定：

- 桌面进程存在（包括隐藏到托盘），且 `userQuestions` 的 `questions.active` 有 `state: open`：等待用户；`continued` 的限时提问不再阻塞。
- `turnBoundary.openTurnStartSeq` 非空：运行；检查点长期没有更新则沿用现有的“可能已中断”阈值。
- `openTurnStartSeq` 为空：本轮结束。
- 找不到 DSH 桌面进程：标记已退出、本轮结束；默认的“隐藏已退出”会隐藏它。

更新时间表示检查点写入时间。投影按事件数/时间间隔节流，并在创建会话、`turn/end` 和卸载会话时写入，因此会比实时状态晚一个写入周期。检查点没有可靠的错误结局字段，不能区分正常结束、取消和失败；不根据摘要文字猜测失败。

`closed` 是桌面进程级判断：桌面端仍开着时，离线缓存无法确认每个会话当前是否仍附着在 Host 上。“隐藏已退出”能识别桌面端整体退出，不能精确识别仍开着的桌面端中单独释放的会话。

官方依据：[投影缓存与写入时机](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-projection-cache/src/index.ts)、[缓存域版本](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-projection-cache/src/spec.ts)、[轮次状态投影](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/projection.ts)、[用户提问投影](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/interaction/user-questions/src/projection.ts)、[官方会话列表](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/session-controller/src/list.ts)。

## 余额来源、语义与凭据

DSH 官方账户采用充值与赠送钱包；没有查到本地持久化的余额快照，也没有固定 5 小时/7 天订阅额度分母。会话里的 `tokenUsage` 是 token 统计，不能换算成账户剩余额度。

依据最新有模型选择的检查点选取计费来源，两个来源不相加：

| DSH 路由 | 官方只读请求 | 凭据 |
|---|---|---|
| `deepseek-official` | `GET https://api.deepseek.com/user/balance` | DSH `refs.DEEPSEEK_API_KEY`，只作为 Authorization 请求头 |
| `deepseek-account` | `GET https://platform.deepseek.com/api/v0/users/get_user_summary` | DSH `records[deepseek-account-platform/default]` 的 grant，只接受官方 issuer，只作为 `x-dsh-auth-token` 请求头 |

只读取 DSH 默认凭据布局中所需的标量，不解析任意 YAML、执行引用或跟随自定义 endpoint。已知本地设置/patch 出现自定义地址或 credential reference 时禁用自动余额查询；复杂 YAML、环境变量凭据、自定义提供商、其他 profile 的自定义凭据不会自动接管。没有可识别的计费来源或凭据时不显示余额。

凭据只在请求期间保存在 Rust 进程内，不发送到前端，不复制到岛屿数据目录，不写入日志、测试或报告。网络只访问以上固定 HTTPS 地址，不跟随重定向；超时 5 秒、响应最多 64 KiB。成功结果只在内存缓存 5 分钟；失败至少隔 1 分钟再试，暂保留同一凭据的旧结果并按现有规则标记过期；更换或删除凭据会清除上一身份的缓存。离线或接口失败不会当作余额为零，也不会刷错误日志。

余额环沿用现有 22px 同心环，DSH 用青绿色：外圈实心表示余额可用，空圈表示不足；内圈实心表示存在赠送余额。环旁显示币种和余额；悬停与读屏给出各币种的充值/赠送余额、来源、更新时间及环的含义，**不显示虚构的已用百分比**，不同货币不相加。API key 来源优先使用服务器的 `is_available`；账户钱包来源以余额是否大于零判断可用。

额度提醒打开时，仅在可用→不足、以及不足→恢复可用的变化时提醒。首次启动、过期数据和请求失败不触发；没有分母，所以不使用 80% 等订阅阈值，阈值开关仍决定是否启用余额提醒。

官方依据：[DeepSeek API 余额格式](https://api-docs.deepseek.com/api/get-user-balance/)、[DSH 账户钱包查询](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/deepseek-account/src/details.ts)、[账户请求协议](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/deepseek-account/src/protocol.ts)、[凭据存储](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/credentials-local/src/index.ts)、[API key 默认引用](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-deepseek-api-key/src/config.ts)。

## 本地服务、聚焦与限制

官方 Host 有 HTTP/RPC、WebSocket 流，桌面宿主通过启动 IPC 获得连接 URL；端口可以由系统分配，连接要认证。`desktop-service/installation.json`、`outbox/` 不是会话或余额发现接口。本次不抓取内存中的私有连接 URL、不扫描端口、不修改 profile 来开放服务；读取本地检查点即可满足离线会话列表，余额沿用明确的官方只读接口。

点击会话根据进程完整路径的 exe 名和只读 Electron 包 repository 优先聚焦所属程序；共享/无法判断归属时取 DSH 主窗口 Z-order 最前者（作为最近使用的近似，没有长期激活历史）。不依赖窗口标题。同名社区包无法识别时保留通用标签。托盘隐藏进程仍判定存活，Windows 阻止前台切换时闪烁提示。

官方 dsh://open 仅打开主窗；DataElement dsh-desktop://、NEXT dsh-app:// 为内部资源协议，未找到选中社区版本可稳定调用的外部指定会话路由。因此本次只聚焦主窗，不能切换具体对话；无可用窗口时返回现有未找到反馈，不调用系统默认协议，避免误开另一安装。

工具审批是 Host 的临时交互状态，不能从本地检查点准确还原；审批等待可能暂时显示运行或可能中断。等待提问可读，但在岛上回答、工具审批、任务/子 Agent 详细进度和准确失败原因不在本次接入范围。DSH 不安装 Claude/Codex 的钩子；这两个来源的钩子状态契约保持原样。

官方依据：[本地 Web 服务](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/webserver/src/index.ts)、[桌面 Host 启动 IPC](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/host-process.ts)、[桌面打开协议](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/main.ts)、[协议注册](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/scripts/electron-builder-config.mjs)。

## 设置与人工验收

“设置 → AI Agent → AI 会话 → 会话来源”可开关 DSH，默认开启。关闭后 DSH 不参与会话列表、小岛标题、会话数、提示音/弹出提醒和余额查询。

需要在实际桌面端确认：运行/结束后的缓存更新延迟；普通和限时用户提问；最小化/后台/多窗口时聚焦；使用账户登录后的钱包读取；窄岛、中英文、离线与切换来源的显示。默认只显示最近 2 小时且未退出的会话，历史会话数量不能直接当作当前可见数量。

## 本机只读核对

2026-11-13 注册表、exe 版本和 Electron 包清单交叉确认：本机为 DataElement DSH Desktop 0.12.1。核对时无 DSH 进程；生产解析得到 5 个会话，全部已结束、已退出，宿主 DataElement。不输出标题、正文、用户名或凭据，不再次请求余额。临时核对测试已移除。

## English

DeepSeek Harness desktop sessions are read offline from its versioned projection checkpoints, with DeepSeek's own mark on a light tile, the existing session cards and source settings. DSH uses prepaid wallets rather than subscription windows: its teal rings indicate balance/bonus availability and show currency amounts, never an invented percentage. Balance queries reuse the default saved DSH credential in native memory, use fixed official HTTPS endpoints, and cache only sanitized amounts in memory. Credentials and conversation contents are not copied into diagnostics or fixtures.

Official source Desktop and DataElement / anywhere-labs community clients are distinguished by executable paths and Electron package metadata. Shared and isolated stores are merged by session ID. The official repository contains Desktop source, but its 38 inspected releases have no installer assets. Clicking a session focuses its running owner or the frontmost DSH main window; no stable external conversation deep link was found. Environment-only custom directories and real multi-client window behavior require manual verification.
