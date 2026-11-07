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
- 会话环（`6588bb1`）：`src/features/session-ring/ringCounts.ts`，五态 `needs / yourturn / working / stale / done`。原来没有标记时把「还没看过」当成等你回复，任务 3 改成看问句。

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
| 4 | Agent 页：圆点四色，橙色会话显示「等你回复」 | 已完成 | fly-island-c6 · lane 6 | 提交 `feat(agent-status): the Agent page and alerts use the session light`。圆点改用会话环的颜色（新变量 `--color-light-*`），运行由蓝改绿、完成由绿改灰、等待确认由橙改红；失败也是红 |
| 5 | 弹出提醒与音效：「等你回复」和「做完了」分开 | 已完成 | fly-island-c6 · lane 6 | 同上。pr3 的 `3a22b52`（B6 1.12）已让带 ↩ 标记的回合按「等待确认」弹出、播提问音效，不新增开关；这里改成用 `replyEnding`，没有标记时问句结尾的回复也一样 |
| 6 | 回归页、`DESIGN.md`、中英文文案 | 已完成 | fly-island-c6 · lane 6 | 同上。文案沿用已有的「等你回复」，不需要新文案 |
| 7 | 回合结束后仍有后台任务时保持绿色（没有标记时） | 已完成 | fly-island-c6 · lane 6 | 提交 `feat(agent-status): a turn waiting on its own background task stays green`。`background_tasks.rs`：工具结果里的 `running in background with ID` / `moved to the background (ID:` 记为启动，带 `<task-id>` 的任务通知或 TaskStop 的 `stopped task` 记为结束；只数最近一轮启动的。回复在问你时仍是黄色。开发服务器这类一直跑的任务也会让那一轮显示绿色，直到你发下一条指令；子 Agent 只在回合进行中计数，回合结束后不再算 |
| 8 | 实测：问句判断的准确率（拿本机最近的会话记录统计） | 已完成 | fly-island-c6 · lane 6 | 见下方实测记录；补了「同意的话」「要的话」两种征询句 |

## 实测记录

### 2026-11-07 · 问句判断（任务 8）

拿本机最近的 Claude Code 会话，取每个正常结束的回合（`stop_reason: end_turn`）的完整回复，用 `asks_user` 的规则判断（Node 移植版，脚本没进仓库）。

- 414 个回合，判成「在问你」90 个。抽看 25 个，全部是真的在等回答（「要按这个方案做吗？」「你选哪个？」「要继续吗？」），没有误报。
- 漏判主要是没有问号的征询句：「你同意的话我来加」「要的话我先在 roadmap 上认领」。加上「同意的话」「要的话」两个说法后，判成「在问你」的变成 104 个。新抓到的 14 个里大多是真正在等你拍板，少数是可有可无的「需要的话我再改」，算在橙色也说得过去。
- 仍会漏判的：「告诉我 K 和倍数就行」这类祈使句，以及问题写在倒数第二段、最后一段是补充说明的回复。
- 回复写在倒数第二段的情况比预想少：问题几乎总在最后一段。
- 结论：问句判断够用，B9 的标记继续保持默认关闭。

## 看过之后不再催（B15，2026-11-07）

红（等你确认、出错）和黄（等你回复）只在用户**还没看过**时算提醒：在 Agent 页点过这个会话，或者它的窗口到了前台（`agent_sessions_in_front`，和 B1 同一套判断），就不再计入会话环和收起条的「待确认」，Agent 页的状态灯变灰、状态文字变淡但仍写「等待确认」「等你回复」，「没处理时再提醒」也不再补。会话的状态本身不变：回复后重新开始跑，下一次再卡住或再问你，按新的一次重新算没看过。判断在 `features/agent-status/unseen.ts`（`asksUser`、`isUnseen`）：卡在半路的会话按文件最后写入时间区分每一次等待，回合结束的按这一轮的开始时间；还在问你的会话即使在岛屿启动前就开始了，也算没看过。看过的记录只在内存里，重启岛屿后还在问你的会话会再提醒一次。

