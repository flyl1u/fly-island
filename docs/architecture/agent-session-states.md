# Agent 会话四色状态（roadmap B11）

开发中实时维护：开始某项把状态改成「进行中」并写上会话，做完改「已完成」并填提交。

状态：`待做` / `进行中` / `已完成` / `不做` / `待用户确认`

## 目标

会话状态统一成四种颜色，岛上所有显示 Agent 状态的地方（折叠栏会话环、Agent 页圆点、弹出提醒、音效）用同一套判断：

| 颜色 | 含义 | 依据 |
|---|---|---|
| 🔴 红 | 回合中途卡住等你 | 阻塞工具开着：提问（AskUserQuestion）、命令审批、计划确认（ExitPlanMode）。钩子或会话记录可确定 |
| 🟠 橙（环上为黄） | 回合结束，Claude 在问你 | ① 回复状态标记 `↩`（B9，可选）；② 没有标记时，最后一段回复以问句结尾 |
| 🟢 绿 | 在跑 | 回合进行中；或标记 `⋯`（在等自己启动的后台任务） |
| ⚪ 灰 | 做完了 | 回合结束，不属于以上任何一种 |

另有两种保持原样：出错（failed，红色加 ✕ 区分）、可能已中断（stale，暗绿）。

## 已有基础（不在本任务内）

- `waiting` 状态：Notification（`permission_prompt` 等）和 PermissionRequest 钩子，`notifications.rs`。
- 回复状态标记 B9（`124be29`，fly-island-pr3）：`reply_marker.rs`，`AgentSessionSummary.replyMarker`。
- 会话环（`6588bb1`）：`src/features/session-ring/ringCounts.ts`，五态 `needs / yourturn / working / stale / done`。没有标记时把「还没看过」当成等你回复。

## 调研结论（2026-11-07）

- 社区项目（Noctalia claude-sessions、Irrlicht、claude-code-ui、session-dash、claude-watch、cc-semaphore）都只有「等你 / 在跑 / 空闲」三态，红色只认阻塞工具。Irrlicht 把 `ExitPlanMode` 也算阻塞，回合结束时有后台进程就不算就绪。
- 能区分「在问你」和「做完了」的只有官方 agent view（方法未公开）和 claude-status-dashboard（让 Claude 用 CLAUDE.md 里的说明自己报告，Stop 钩子兜底）。B9 走的就是后一条路。
- 没有找到用问句判断的开源实现，问句兜底是我们自己的做法，准确率要实测。

## 任务

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| 1 | Rust：没有标记时判断最后一段回复是否以问句结尾，新字段 `replyAsks`。必须在截断前、按原文判断（`lastMessage` 只保留开头 200 字，问句通常在末尾） | 已完成 | fly-island-c6 · lane 6 | 提交 `feat(agent-status): one session light, with questions and plans waiting on the user`；规则：去掉 Markdown 后最后一个非空段落以 `？` / `?` 结尾，或以「吗」「呢」等疑问语气收尾；代码块不算 |
| 2 | Rust：会话记录里最后一个工具调用是 AskUserQuestion / ExitPlanMode 且还没有结果时，回合中的会话算 `waiting`（不依赖钩子，补上计划确认） | 已完成 | fly-island-c6 · lane 6 | 提交 `feat(agent-status): one session light, with questions and plans waiting on the user`；钩子没装或通知被覆盖时也能亮红 |
| 3 | 前端：四态判断提成一个纯函数（agent-status 内），会话环改用它；没有标记时用 `replyAsks`，不再把「没看过」当成等你回复（没看过仍由 B1 高亮表示） | 已完成 | fly-island-c6 · lane 6 | 提交 `feat(agent-status): one session light, with questions and plans waiting on the user`；单元测试 |
| 4 | Agent 页：圆点四色，橙色会话显示「等你回复」 | 待做 | | |
| 5 | 弹出提醒与音效：「会话完成」拆成「等你回复」和「做完了」两个开关，默认都开 | 待做 | | 旧设置的 `agentAlertCompleted` 两个都沿用 |
| 6 | 回归页、`DESIGN.md`、`overview.md`、中英文文案 | 待做 | | |
| 7 | 回合结束后仍有后台任务 / 子 Agent 时保持绿色（没有标记时） | 待做 | | 需要先确认会话记录里能否看到还在跑的后台任务 |
| 8 | 实测：问句判断的准确率（拿本机最近的会话记录统计） | 已完成 | fly-island-c6 · lane 6 | 见下方实测记录；补了「同意的话」「要的话」两种征询句 |

## 实测记录

### 2026-11-07 · 问句判断（任务 8）

拿本机最近的 Claude Code 会话，取每个正常结束的回合（`stop_reason: end_turn`）的完整回复，用 `asks_user` 的规则判断（Node 移植版，脚本没进仓库）。

- 414 个回合，判成「在问你」90 个。抽看 25 个，全部是真的在等回答（「要按这个方案做吗？」「你选哪个？」「要继续吗？」），没有误报。
- 漏判主要是没有问号的征询句：「你同意的话我来加」「要的话我先在 roadmap 上认领」。加上「同意的话」「要的话」两个说法后，判成「在问你」的变成 104 个。新抓到的 14 个里大多是真正在等你拍板，少数是可有可无的「需要的话我再改」，算在橙色也说得过去。
- 仍会漏判的：「告诉我 K 和倍数就行」这类祈使句，以及问题写在倒数第二段、最后一段是补充说明的回复。
- 回复写在倒数第二段的情况比预想少：问题几乎总在最后一段。
- 结论：问句判断够用，B9 的标记继续保持默认关闭。
