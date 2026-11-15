# Codex 纯思考、完成提醒与会话跳转

日期：2026-11-15。分支：`feat/agent-codex`。本次不修改额度组件、不修改第三方客户端或 Codex 配置。

## 真实数据与复现

只读扫描 `~/.codex/sessions` 中按修改时间排列的最近 120 个 rollout；成功解析的 87 个文件包含 52 个 `originator: Codex Desktop / source: vscode`、34 个 `codex_exec / exec` 和 1 个 `source.subagent.thread_spawn`。桌面版的正常 source 没有被原来的对象过滤规则误杀；不能把 `source: vscode` 直接等同于 VS Code 扩展。

找到多个没有 `function_call`、`custom_tool_call`、`web_search_call` 的完整 turn，无需再运行 `codex exec`。选取 2026-11-11 的一轮保留为 [脱敏 fixture](../../src-tauri/src/agent_status/fixtures/codex-desktop-thinking.jsonl)：所有正文、密文、用户/账号/会话标识、目录和 Git 信息均替换，保留实际记录种类、时间戳、字段结构与计数。fixture 最后一条是之后的设置记录，用于证明文件修改不等于任务刚完成。

| UTC 时间 | 记录 |
|---|---|
| 04:40:19.936 | `event_msg.task_started` |
| 04:40:20.291 | `turn_context`，包含模型、effort、sandbox |
| 04:40:21.348 | `response_item.message`，`role: user`；这一轮没有 `event_msg.user_message` |
| 04:40:21.358 / .396 | `event_msg.item_completed` / `response_item.configuration_update` |
| 04:40:52.964 | 第一条 `response_item.reasoning`，此前有对应 `item_completed` |
| 04:41:07.557、27.684、42.663、04:42:04.330、17.142 | 后续五条 reasoning，各自有对应 `item_completed` |
| 04:42:59.978 | `response_item.message(role=assistant)` |
| 04:43:00.799 / .809 | `token_usage_record` / `event_msg.token_count` |
| 04:43:05.333 | `event_msg.task_complete`，包含 `last_agent_message` |
| 08:06:10.386 | `event_msg.thread_settings_applied` |

这轮开始至完成 165.397 秒，最长连续记录间隔 42.805 秒；上下文总 tokens 为 213,419，reasoning output 为 3,106。另一轮无工具调用任务耗时 188.062 秒，最长静默 147.979 秒。`token_count` 在这些样本中出现在生成结束附近，不能拿它当固定心跳。

复现的问题：

- 桌面版用户输入不是 `event_msg.user_message`，原解析拿不到 `ownerPromptAt`。虽然有 `task_started`，前端仍把完成当作非用户发起的任务抑制掉。
- 用真实 fixture 的开始和用户记录，加上一条合法的 300 KiB reasoning，冷启动时末尾 256 KiB 不再包含任何完整生命周期记录，原解析得到 Unknown → completed。新单测覆盖冷启动和后续增量写入。
- 实际存在起于 11-04、到 11-09 仍写入的会话，以及 11-10 目录里 11-11 的 turn。目录表示创建日期；只取最新两天不能覆盖恢复的长会话。点击查找 rollout 原先的 14 天限制有同样问题。

## 修复与取舍

### 状态、活跃时间与 stale

`codex_activity.rs` 第一次逐行读完整 rollout，只保存生命周期摘要；以后按字节偏移读取追加的完整行。未写完的最后一行留到下次处理，截断或同长度替换会重建摘要。正文展示仍读 256 KiB 尾部，不在每次轮询重读整个文件。

`task_started`、旧格式 `user_message`、桌面版 `response_item.message(role=user)` 开始运行；明确完成、失败、取消才结束。reasoning、token 统计、turn_context 和其他元数据不擅自结束 turn。任意新写入沿用文件 mtime 更新 `updatedAt`，并保留开始/用户/最后完成时间，避免尾部裁剪丢失它们。

Codex 没有可以依赖的固定 heartbeat，因此未结束 turn 改为静默 30 分钟才判为 stale（真实样本最长静默约 148 秒；保留上限是为了异常退出的会话最终能熄灯）；Claude Code 和 hook marker 原有超时不变。依据是上述真实记录的延迟写入行为，而不是假设 token_count 会定时增长。已有 hook 的进程退出/SessionEnd 判断继续生效；没有可靠结束信号的异常退出可能仍显示运行中，直到退出选定的 1/2/6/24 小时时间窗口。这个限制比把合法长思考误判为中断更明确，不伪造“已完成”。

扫描所有日期目录，但仍按每个文件的 mtime 筛选，仍最多展示 12 个会话。子 agent/internal 继续过滤，补全字符串形式及 metadata BOM 容错；正常 Desktop / vscode / app / custom source 有测试。

### 提醒与折叠态

摘要新增可选 `lastCompletedAt`，只取显式完成事件的时间，不用文件 mtime 冒充。前后端兼容字段缺失，DSH/WorkBuddy 不发送它。弹出与声音共享同一完成判定：

- 前后都为 completed，但显式完成时间增加，识别为轮询间已做完的一轮。
- 首次发现只补完成时间在过去 15 秒内的任务；旧记录、缺失/无效/未来时间均保持安静。
- 记录已经见过的完成时间，临时离开列表再出现不重复提醒；同样的阶段、标题、答案也不会吞掉新一轮。
- 沿用 6 秒稳定等待、用户输入去重、后台 marker/task 抑制、前台静音和游戏勿扰。旧的延迟回调不能提前宣布一个更新的 turn 完成。

无需新增折叠态 UI：现有 `useIslandAgentSessions → countActiveSessions → useAgentIndicator` 已用会话运行数驱动蓝灯和标题，修好 rollout 解析后，即使 hooks 未被信任也可运行。完成后回到现有 idle/done 灯状态，标题沿用现有 3 秒保留和弹出/声音设置。未修改 `AgentQuotaRings` / `QuotaRings`。

### 跳转：保留旧路径，再补兜底

本机只读检查：安装包 `OpenAI.Codex 26.1103.7773.0` 的 AppxManifest 已声明 `windows.protocol`、scheme `codex` 和 `--single-argument %1`；普通 HKCR/codex 项为空不能证明 Store 协议未注册。只读检查本机 `app.asar` 的协议处理，确认接受 `codex://threads/<uuid>` 和 Windows `--single-argument`。只读连接 `~/.codex/state_5.sqlite?mode=ro`，确认原始样本的 rollout `payload.id` 确实是 `threads.id`。分页文件名的第二个 UUID 是页标识，不能替代 metadata 中的线程 ID。

原代码的确定缺口：窗口匹配失败直接返回，不会发送客户端自己的会话链接；没有 hooks 的 Desktop / 扩展共享 app-server，不保证有对应 cwd 的独立 CLI。原有“按目录找唯一 codex.exe”既可能因多进程而失败，也可能找到同目录的其他 CLI。终端/编辑器/桌面进程名称不能代替会话归属。

保留 SessionStart、记忆、Claude registry、Codex cwd、Orca/终端标签和标题的原有顺序。只有没有窗口或原路径未发出会话链接时，依据 rollout.originator 兜底：

1. Desktop：发送 `codex://threads/<metadata.id>`。
2. `codex_vscode`：只有能确认安装了 `openai.chatgpt` 的唯一编辑器时才发送其原有 `<scheme>://openai.chatgpt/local/<id>`；已定位的编辑器仍优先，多个候选不猜。
3. URI 无处理程序时，不弹 Windows 选择应用/错误对话框；仅对 Desktop 使用已经打开的桌面窗口的 exe，传 `--single-argument <link>`。不把 headless CLI 当成桌面程序，不安装协议、不写注册表、不修改客户端。

新路径在 `agent-focus.log` 写入 `conversation-fallback=sent/no-handler`、`conversation-executable=sent/unavailable`，不记标题和正文。桌面/扩展的链接规则、无扩展、不明确归属、旧目录恢复等由 Rust 测试覆盖。

## 涉及文件

- Rust：`agent_status/codex_activity.rs`、`codex_activity_tests.rs`、`fixtures/codex-desktop-thinking.jsonl`、`sessions.rs`、`session_scan.rs`、`codex_process.rs`、`conversation_link.rs`、`focus.rs`、`mod.rs`；`dsh_sessions.rs` / `workbuddy_sessions.rs` 仅兼容新增可选摘要字段。
- 前端：`features/agent-status/completion.ts`、`alerts.ts`、`announce.ts`、`api.ts`、`sessionList.ts`、`sounds/events.ts`、`sounds/useAgentSounds.ts`。
- 测试：`tests/unit/agent-codex-completion.test.mjs`、`tests/regression/agent-alerts.tsx`。
- 文档：`src-tauri/AGENTS.md`、`docs/architecture/overview.md`、`contracts.md`、`docs/design/agent.md` 和本记录。

## 验证

所有 Rust 命令使用 `$env:CARGO_TARGET_DIR='D:/FocuSD/.worktrees/.cargo-target'`。精确结果待最终检查结束后补在此处。

## 需要作者实机验收

- 本机没有安装 VS Code 的 `openai.chatgpt` 扩展，无法验证其真实选中会话效果；安装守卫、唯一候选和 URI 格式已测试。请在扩展发起纯思考问题后，从岛上点击对应会话，检查是否选中正确线程。
- Codex Desktop 的最终会话选中、系统拒绝抢前台、多窗口、最小化/托盘状态，以及协议损坏时 exe 回退，需要作者实机检查。只读检查清单/客户端路由/数据库不能代替最终视觉验收。
- [computer-use 技能](C:/Users/32834/.codex/plugins/cache/openai-bundled/computer-use/26.1103.60933/skills/computer-use/SKILL.md) 所引用的 `docs/guidance.md` 明确要求 “Do not automate the ChatGPT desktop app UI or Codex CLI or Codex extensions within Windows apps.” 因而未通过桌面 UI 自动化操控当前 ChatGPT/Codex 客户端，也未换工具绕过此限制。
- 建议各测试一轮 hooks 未信任的 Desktop 与 VS Code：发 2–3 分钟纯思考问题；运行时蓝灯/标题出现；完成 6 秒后只提醒一次；连续发送能在一秒内结束的短问题；重启岛屿不响历史任务；恢复数日前会话能发现且可点击。

未完成的是上述第三方客户端最终交互验收；没有需要迁移的用户数据或新增设置。
