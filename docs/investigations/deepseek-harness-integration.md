# Issue #51：DSH 接入与验收报告

日期：2026-11-12。工作分支：`feat/dsh-agent`，源码工作区：`D:/FocuSD-dsh`。未创建 Git 提交，未升级或新增依赖。

## 调研与实现结论

详细的数据结构、状态规则、安全边界与官方源码链接见 [DSH 接入说明](../deepseek-harness.md)。

- **会话**：读取 `%APPDATA%/dsh-desktop/harness/storages/session_projcache/sessions/*.json`，对应日志是 `sessions/<项目分片>/session-<UUID>/session.v3.jsonl.zstd` 或 `session.v4.jsonl.zstd`。只检查压缩日志存在，不解压会话正文。新版共享安装支持 `~/.dsh`（须存在 `profiles/desktop`）。按域/投影版本校验，空白、损坏、未知格式或缺少日志的记录静默跳过。
- **状态**：官方 `turnBoundary` 投影的 open turn 表示运行、关闭的 turn 表示本轮结束；`userQuestions.questions.active` 中 `state: open` 表示等待用户回答，`continued` 不阻塞；长期不更新沿用现有 stale 阈值。桌面进程整体退出则标记 closed，托盘隐藏仍按进程存活处理。标题、初始目录、模型、推理强度、最新一轮摘要、时间与上下文 token 数接入现有卡片。
- **本地服务**：DSH Host 提供 HTTP/RPC/WebSocket，但桌面端通过启动 IPC 获取带认证的动态连接；未找到稳定的、免认证的对外发现接口。本次使用本地检查点读取会话，避免修改 profile、扫描端口或依赖私有宿主连接。
- **余额**：官方语义是按量付费钱包，不是 5 小时/7 天订阅窗口。最新模型选择为 `deepseek-official` 时，读取 DSH 的默认 API key 引用并请求 `GET https://api.deepseek.com/user/balance`；为 `deepseek-account` 时使用官方 issuer 的已存 grant，请求 `GET https://platform.deepseek.com/api/v0/users/get_user_summary`。账户钱包的充值与赠送金额按十进制精确相加，币种保持独立。
- **额度环与提醒**：沿用 22px 同心环，DSH 为青绿色，环旁显示币种和余额。外圈表示余额可用，内圈表示存在赠送余额；没有虚构百分比或重置倒计时。悬停/读屏说明余额、来源和语义。提醒仅覆盖可用→不足、不足→恢复；首次、过期或请求失败不提醒。
- **凭据**：只在 Rust 请求进程内读取使用，不写日志、前端、报告或测试样例；仅使用固定官方 HTTPS 地址，不跟随重定向，5 秒超时，响应上限 64 KiB。成功结果只在内存缓存 5 分钟，失败至少间隔 1 分钟；身份变更会清除上一身份的数据。复杂 YAML、自定义来源/引用、环境变量凭据不自动接管。
- **设置与展示**：新增 DSH 来源开关，默认开；关闭后 DSH 不参与会话列表、小岛标题/会话数、音效/弹出和余额查询。提供方使用原创 `DS` 文字图标；宿主优先读取本机 exe 图标，文字简写 `DSH`，文字模式可查看全名。三种会话显示方式、中英文和 web-demo 均兼容。

## 已知限制与人工确认

1. 当前官方打开协议只有 `dsh://open`，不接受具体会话 ID。卡片聚焦 DSH 主窗口，不能精确打开某个对话。
2. 投影检查点按间隔写入，会有延迟。缓存不包含可靠的工具审批临时状态和失败结局，无法精确区分失败、取消、正常结束；不会根据回复文本猜测。审批等待可能显示运行/stale，在岛上审批或回答尚未接入。
3. closed 只能判断桌面进程整体退出，不能确认仍开着的桌面端中某个会话是否已被 Host 释放。
4. 核对时没有运行中的真实 DSH 窗口。运行/等待/结束切换的实际延迟，后台/最小化/托盘/多窗口聚焦，以及 grant 登录方式的实际钱包请求，仍需在桌面端人工确认。API key 余额来源已经实际读取成功。
5. 没有数据、未识别安装、离线、凭据缺失或接口失败时安静隐藏对应内容；过期的同一身份余额可暂留并标记过期，不会被当作零余额。

## 本机只读核对

临时 Rust 测试直接调用生产解析与余额函数，命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml dsh_local_probe -- --ignored --nocapture
```

结果：4 个非空会话，已结束 4、已退出 4，最近 2 小时 0；桌面端未运行。余额来源 `dshApi`，可用，CNY 余额 **2.00**、充值 **2.00**、赠送 **0.00**。未输出标题、对话正文、token 或 API key。临时测试文件及模块声明已移除。

## 新增契约

- 命令：`get_dsh_usage()`，返回 `null` 或 `{ updatedAt, available, wallets: [{ currency, total, granted, toppedUp }], source }`；`source` 为 `dshApi` 或 `dshAccount`，金额为字符串。
- 既有会话/聚焦命令：provider 新增 `dsh`，命令名、参数名和既有字段不变。
- 设置：原有 `focusd-island-settings` 中新增 `agentShowDsh`，缺失时 true。无新增 localStorage key 或事件。
- 权限：自有 Rust 命令通过 handler 注册；没有新增插件/核心能力需求，现有 capabilities 足够。Claude/Codex hook 状态和 `agent-status.json` 保持双来源契约。

以上同时登记在 [contracts.md](../architecture/contracts.md)。

## 最终验证

| 命令/检查 | 结果 |
|---|---|
| `cargo test --manifest-path src-tauri/Cargo.toml` | 288 通过，7 个既有桌面环境测试按原设置忽略，0 失败；doc tests 通过 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 通过，0 警告 |
| `pnpm check` | 类型、回归页类型、ESLint、文件行数及 275 项 Node 测试全部通过 |
| `pnpm build` | 通过；最终桌面构建的 beforeBuild 再次执行通过 |
| `pnpm test:regression` | 19 页、650 项检查全部通过，含 DSH 8 项、原 Agent 页 89 项和设置页 120 项 |
| `pnpm build:web-demo` | 通过，最终来源结构兼容 |
| `pnpm tauri build --no-bundle` | 通过，产物 `src-tauri/target/release/focusd-island.exe`（23,899,136 字节） |
| Ego lite 视觉验收 | 中英文、380px 视口、三来源同排、DSH 图标和余额详情已检查；详情各行无裁切 |
| `git diff --check` | 通过 |

Vite 有大于 500 kB 的 chunk 提示，前端和桌面构建成功。没有以浏览器 mock 的通过代替真实原生窗口验收，未启动 DSH 或运行新的岛屿进程。

最终 Cargo 构建显式设置 `CARGO_TARGET_DIR=D:/FocuSD-dsh/src-tauri/target`；构建临时目录为本 worktree 的 `node_modules/.cache/dsh-validation`。首次本机探测编译曾沿用环境预设的外部缓存 `D:/CodexBuild/Cargo-dsh`；发现后改为工作区内 target，后续验证/正式产物均在本 worktree。未修改 `D:/FocuSD` 源码或 DSH 自身的数据/配置，未改写外部已有源码。

## 改动文件

Rust：

- `src-tauri/src/agent_status/dsh_sessions.rs`
- `src-tauri/src/agent_status/dsh_sessions_tests.rs`
- `src-tauri/src/agent_status/dsh_credentials.rs`
- `src-tauri/src/agent_status/dsh_usage.rs`
- `src-tauri/src/agent_status/dsh_usage_tests.rs`
- `src-tauri/src/agent_status/mod.rs`
- `src-tauri/src/agent_status/focus.rs`
- `src-tauri/src/agent_status/session_host.rs`

前端 Agent 与设置：

- `src/features/agent-status/AgentProviderIcon.tsx`、`AgentProviderIcon.css`
- `src/features/agent-status/AgentQuotaRings.tsx`、`AgentQuotaRings.css`
- `src/features/agent-status/QuotaRings.tsx`
- `src/features/agent-status/DshQuotaRing.tsx`
- `src/features/agent-status/dshUsage.ts`
- `src/features/agent-status/QuotaAlertPopup.tsx`
- `src/features/agent-status/SessionHostLabel.tsx`
- `src/features/agent-status/api.ts`
- `src/features/agent-status/quotaAlerts.ts`
- `src/features/agent-status/sessionList.ts`
- `src/features/agent-status/status.ts`
- `src/features/agent-status/usage.ts`
- `src/features/agent-status/useAgentUsages.ts`
- `src/features/agent-status/useIslandAgentSessions.ts`
- `src/features/appearance/types.ts`、`settingsDefaults.ts`、`normalizeAgentSettings.ts`
- `src/i18n/sections/agent.ts`、`src/i18n/sections/settings/agent.ts`
- `src/windows/island/useIslandAgents.ts`
- `src/windows/settings/AgentSettingsPage.tsx`

测试与演示：

- `tests/unit/agent-dsh.test.mjs`
- `tests/unit/appearance.test.mjs`
- `tests/regression/agent-dsh.html`、`agent-dsh-page.tsx`、`agent-dsh.tsx`
- `tests/regression/agent-sessions.tsx`
- `tests/regression/settings.tsx`
- `scripts/run-regression.mjs`
- `web-demo/mocks.ts`

文档：

- `README.md`、`README.en.md`
- `src-tauri/AGENTS.md`
- `docs/deepseek-harness.md`
- `docs/design/agent.md`
- `docs/architecture/contracts.md`、`data-storage.md`、`overview.md`
- `docs/investigations/deepseek-harness-integration.md`（本报告）
