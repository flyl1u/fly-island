# Agent 岛上交互：任务清单

方案见 [agent-island-interaction.md](agent-island-interaction.md)，路线图条目是 [B6](../roadmap.md)。**开发过程中实时维护**：

- 开始某项时，状态改成「进行中」，写上负责的会话（例如 `fly-island-lanes/3`），避免两个会话做同一件事。
- 做完改成「已完成」，填提交号，和代码放在同一个提交里。
- 实测得出的结论写进「实测记录」，并同步修改方案文档里受影响的部分。
- 做的过程中发现的新问题追加到对应一期；决定不做的标「不做」并写原因，不要删除。
- 一期全部完成后，在路线图 B6 的备注里更新进度。

状态：`待做` / `进行中` / `已完成` / `不做` / `待用户确认`

## 第 0 期：实测钩子行为

| # | 任务 | 状态 | 负责 | 提交 / 备注 |
|---|---|---|---|---|
| 0.1 | Claude Code：`PermissionRequest` 钩子等待时，终端审批框是同时显示还是等钩子返回 | 已完成 | fly-island-3 · lane 3 | 等钩子返回才显示，见「实测记录」 |
| 0.2 | Claude Code：先在终端里回答后，钩子的请求是否被取消（HTTP 连接是否断开） | 已完成 | fly-island-3 · lane 3 | 等待时终端没有审批框可答；按 Esc 中断时连接立即断开 |
| 0.3 | Claude Code：`AskUserQuestion` 的 `PreToolUse` 钩子等待时终端选项界面的表现；`answers` 填不在选项里的文字能否被接受 | 已完成 | fly-island-3 · lane 3 | 阻塞终端选项，之后还会再走一次 `PermissionRequest`；自由文本原样接受 |
| 0.4 | Codex：`PermissionRequest` 钩子等待时终端的表现，`allow` / `deny` 是否生效 | 待做 | | 这次没测（本机没跑 Codex）。转发脚本（command 钩子 → HTTP）已验证可用，做 2.2 前补测 |
| 0.5 | Windows 上 HTTP 钩子到 `127.0.0.1` 的延迟；岛屿没运行、端口不对、超时三种情况下 Agent 是否照常弹审批框 | 已完成 | fly-island-3 · lane 3 | 延迟可忽略；没有程序监听时审批框立即出现。「端口不对」与「没运行」相同，超时按 0.1 的空决定处理 |

## 第 1 期：音效与自动弹出提醒

| # | 任务 | 状态 | 负责 | 提交 / 备注 |
|---|---|---|---|---|
| 1.1 | 原创音效：每个事件一个短音效（会话开始、完成、出错、需要审批、需要回答、发出消息、上下文快满），登记来源与许可 | 已完成 | fly-island-lanes/3 | 提交 `feat(agent-status): agent sounds, a Sounds page and importable sound packs`。用户选定 H「拇指琴」（2026-11-06），见 `src/assets/sounds/README.md`。参考软件的音效不公开分发，见下方「音效」 |
| 1.2 | 音效播放：按事件选音效或「无」、试听、总音量、静音时段，游戏模式和智能抑制时不响 | 已完成 | fly-island-lanes/3 | 同 1.1。 音效由 `sounds/useAgentSounds` 自己按会话状态变化播放，和弹出提醒互不依赖：关掉弹出、留着音效就是「只出声」。`playAgentSound(event, settings)` 也可以单独调用 |
| 1.3 | 导入自己的音效文件（复制到应用数据目录） | 已完成 | fly-island-lanes/3 | 同 1.1。 也支持按文件名一次导入一个文件夹 |
| 1.4 | 设置 → 声音页（分组列表组件） | 已完成 | fly-island-lanes/3 | 同 1.1。 |
| 1.10 | 音效包格式：文件夹里一个清单（包名、作者、许可、事件 → 文件），在声音页整包导入、切换、删除；也认 CESP 分类名（`session.start`、`task.complete` 等），网上现成的包能直接导入 | 已完成 | fly-island-lanes/3 | 同 1.1。 用户确认要做，别人可以制作音效包 |
| 1.11 | 插件市场的「音效包」：一种只带音效、不运行代码的插件，安装后出现在声音页；上架要求写明许可，只收 CC0、MIT 这类允许再分发的 | 待做 | | 依赖 1.10。和插件平台一起排期 |
| 1.5 | 事件来源：把完成、出错、等待审批、需要回答、会话开始等事件从现有钩子推到前端，每个会话只留最新一条 | 已完成 | fly-island-lanes/4 | 提交 `feat(agent-status): open the Agent page when a session finishes, fails or waits`。没有改钩子：完成、出错、等待（审批和回答都算）由每秒读一次的会话列表的状态变化得出（`alerts.ts`），回复文字来自会话记录。「会话开始」后来也用于弹出（roadmap B6b）：一个结束了的会话再次运行，或新会话第一次出现就在运行，算开始 |
| 1.6 | 自动弹出卡片（只读）：完成、出错、等待审批；跳到终端；停留时长可设，Esc 或点外面关闭；折叠态和贴边隐藏时也能弹 | 已完成 | fly-island-lanes/4 | 同上。没有单独的卡片：收起的岛屿直接展开到 Agent 页，只显示这一个会话（roadmap B6a，用户反馈整页列表出来不对），点这一行跳到终端，Esc 照常收起；点岛上别处、切页或收起后回到完整列表。「点外面关闭」做不到（岛屿窗口外的点击收不到），由停留时间收起代替；鼠标停在岛上时不收，在面板里点过就不再自动收 |
| 1.7 | 智能抑制：会话的终端标签或窗口在前台时不弹不响；游戏模式勿扰联动；用户在岛上打字时排队 | 已完成 | fly-island-lanes/4 | 同上。前台判断用 `agent_sessions_in_front`（只到窗口一级，不分标签）；游戏模式用 `game.quiet`。岛屿已被你展开时不弹也不替你收起（不排队：会话行本来就会显示新状态，B1 的未看高亮也会标出来） |
| 1.8 | 弹出设置：每种事件可选弹出 / 只出声 / 都不要；停留时长 | 已完成 | fly-island-lanes/4 | 同上。设置 → AI Agent → 弹出提醒：三种事件各一个开关，停留 3 / 5 / 8 / 15 / 30 秒。「只出声」等音效（1.2）做好后把开关换成三选一 |
| 1.9 | 回归页覆盖卡片的弹出、排队、抑制；文档与 `DESIGN.md` 更新 | 已完成 | fly-island-lanes/4 | 同上。`tests/regression/agent-alerts.html` |

## 第 2 期：在岛上审批

| # | 任务 | 状态 | 负责 | 提交 / 备注 |
|---|---|---|---|---|
| 2.1 | 本机 HTTP 端点：只听 `127.0.0.1`、令牌鉴权、端口被占用时换端口；等待中的请求按会话排队；岛屿退出时全部返回空决定 | 已完成 | fly-island-c6 · lane 6 | 提交 `feat(agent-status): an endpoint that holds agent approvals for the island`。`src-tauri/src/agent_approval/`，标准库 `TcpListener`（`tiny_http` 挂起时发现不了对方断开）。路径 `/claude/permission-request`、`/codex/permission-request`，首选端口 47830，`agent-approval.json` 存端口和令牌；开关命令 `set_agent_approval_enabled`（默认关，关着时立即返回 `{}`）；`AskUserQuestion` 的 PermissionRequest 立即返回 `{}`；安装用 `agent_approval::endpoint()` / `hook_url()`。前端封装 `src/features/agent-approval/api.ts` |
| 2.2 | 「安装/修复」：Claude Code 加 `PermissionRequest`（HTTP），Codex 加 `PermissionRequest`；「在岛上审批」开关 | 进行中 | fly-island-67 · lane 3 · 2026-11-06 22:05 | 已合入，待本机实测。Claude Code：HTTP 钩子，带令牌和 `X-FocuSD-Hook` 标记头（HTTP 钩子没有脚本路径，靠它认出是 FocuSD 的），超时 150 秒；端口变了状态显示需要修复。Codex：`focusd-agent-approval.ps1` 转发，每次现读 `agent-approval.json`；先用 300 毫秒探测端口，岛屿没开时 Codex 约 0.6 秒后照常出审批框（不探测要等 2.4 秒）。改动方案：钩子总是安装，开关（设置 → AI Agent → 在岛上审批，`focusd-island-agent-approval`，默认关）只开关端点 |
| 2.3 | 审批卡片：完整命令（可展开）、允许一次、拒绝、始终允许（仅 Claude Code，默认只对本次会话生效）、到终端处理 | 进行中 | fly-island-67 · lane 3 · 2026-11-06 22:05 | 已合入并接上端点（提交 `feat(agent-status): a card on the island for permission requests agents wait on` 和 `connect the permission card to the approval endpoint`），待本机实测 |
| 2.4 | 等待上限，超时交还终端；终端已处理时撤掉卡片 | 进行中 | fly-island-67（前端，随 2.3） | Rust 侧已完成（提交 `feat(agent-status): an endpoint that holds agent approvals for the island`）：等待上限 120 秒，到时返回 `{}`（钩子的 timeout 要设成 ≥ 150 秒）；Agent 断开连接（终端按 Esc）时撤掉并发 `agent-approval-closed`（`disconnected`）；岛屿退出时全部返回 `{}`（`shutdown`） |
| 2.5 | 卡片快捷键：卡片显示时注册、消失时注销；出现后 0.5 秒内不接受点击和按键 | 进行中 | fly-island-67 · lane 3 · 2026-11-06 22:05 | 已合入（提交 `feat(agent-status): shortcuts for the permission card while it shows`，`approval_hotkeys.rs`，卡片可以操作后才注册），待本机实测。默认 Ctrl+Alt+Y 允许、Ctrl+Alt+N 拒绝、Ctrl+Alt+T 到终端，避开别的程序常用的 Ctrl+字母；在快捷键页可改留到以后 |
| 2.6 | 测试：Rust 单元测试（排队、超时、鉴权）、回归页、本机实测两种 Agent | 进行中 | fly-island-67（回归页、本机实测） | Rust 单元测试已完成（提交 `feat(agent-status): an endpoint that holds agent approvals for the island`）：`agent_approval/tests.rs` 12 项，含真实 TCP 下的批准、交还终端、超时、断开、排队、关闭开关、鉴权和退出 |

## 第 3 期：在岛上回答提问（仅 Claude Code）

| # | 任务 | 状态 | 负责 | 提交 / 备注 |
|---|---|---|---|---|
| 3.1 | 安装 `PreToolUse`（只匹配 `AskUserQuestion`，HTTP） | 待做 | | |
| 3.2 | 提问卡片：单选、多选加提交、数字键选择、到终端处理 | 待做 | | |
| 3.3 | 自由文本回答 | 待做 | | 依赖 0.3 |
| 3.4 | 测试与文档 | 待做 | | |

## 第 4 期：其余

| # | 任务 | 状态 | 负责 | 提交 / 备注 |
|---|---|---|---|---|
| 4.1 | 后续提醒：没处理的审批或提问过一段时间再提醒一次 | 待做 | | |
| 4.2 | 子 Agent / Agent Team 通知选项 | 待做 | | 和 B3 一起 |
| 4.3 | 会话过滤：按目录或首条提示词隐藏 | 待做 | | |
| 4.4 | 「自动批准」（切换权限模式），放在卡片的「更多」里并二次确认 | 待用户确认 | | 风险较大 |

## 音效

- 内置音效必须是原创的。参考软件的录音只用来提炼风格参数（时长、音高范围、音色类别、响度、起音快慢），不复制它的旋律、音高序列或具体音色。
- 生成方式：用代码合成（几个正弦或三角波叠加加包络），每个事件出 2～3 个候选，导出 `.wav` 给用户试听后选定。
- 参考录音放在本机 `E:\Projects\design-refs\vibe-island-sounds`，**不进仓库**。
- 2026-11-06 用户选定 H「拇指琴」作为内置音效（合成脚本参数见候选文件夹）。
- 参考软件的音效（录音、引导音）和 Apple 系统音效都不进仓库、不上插件市场；用户有那款软件的授权，录音只作为本机导入的音效包自己使用。市场上的音效包只收 CC0、MIT 等允许再分发的许可，MIT 要附原许可证文本。

## 实测记录

### 2026-11-06 · Claude Code 2.1.318 · Windows 11

**做法**：在仓库外的临时目录放了一个 Node 测试服务器（`127.0.0.1:47811`）。它每次请求都重读一个模式文件，可以挂起 N 秒、允许、拒绝、返回空 `{}`、自动回答，并记录连接何时被对方关闭。测试项目的 `.claude/settings.local.json` 配了两个 HTTP 钩子：`PermissionRequest` 带 `Authorization` 头，`PreToolUse` 只匹配 `AskUserQuestion`。用户在这个项目里以**默认（手动）模式**让 Claude 运行 `cmd //c echo ...` 或提问。测试目录用完即删，不进仓库。

| 测试 | 结果 |
|---|---|
| auto 模式 | auto 模式自己批准的命令**不触发** `PermissionRequest`，钩子收不到请求。在岛上审批只对手动审批的会话有用 |
| 挂起 30 秒后返回 `{}` | 等待期间终端**不显示**审批框，只有一行运行中的提示；钩子返回空决定后审批框才出现，用户在终端照常选择 |
| 返回 `allow` | 立即执行，不出审批框，终端写着 "Allowed by PermissionRequest hook" |
| 返回 `deny` 加 `message` | 不执行，终端写着 "Denied by PermissionRequest hook"，`message` 传给了模型 |
| 挂起时按 Esc | 立即中断。服务器在 4.6 秒时看到连接被关闭，可以据此撤掉卡片 |
| `headers` | `Authorization` 头原样送达，可以用来做令牌鉴权 |
| `AskUserQuestion`，`PreToolUse` 挂起后返回 `{}` | 等待期间终端不显示选项。返回后**又触发一次** `PermissionRequest`（同样挂起 30 秒），两者都返回后终端选项才出现，前后约 60 秒 |
| `PreToolUse` 返回 `allow` 加 `updatedInput.answers`（第一个选项） | 立即生效，终端不出选项，之后也不再触发 `PermissionRequest`，模型收到的就是这个答案 |
| `answers` 填不在选项里的文字 | 原样接受，模型收到了这段文字 |
| 服务器没运行（端口上没有程序） | 审批框立即出现，没有卡顿，终端也没有报错 |
| 延迟 | 服务器从收到请求到回复都在 20 毫秒以内，Agent 那边感觉不到差别 |

**对第 2、3 期的影响**：

- 钩子等待时终端没法操作，所以岛上必须有「到终端处理」（立即返回空决定），并且要有等待上限，到时返回空决定交还终端。会话的终端在前台时，直接返回空决定，不弹卡片。
- 不存在「终端先答了」的情况；需要处理的是用户按 Esc 或 Agent 退出：连接一断就撤掉卡片。
- `AskUserQuestion` 会先后经过 `PreToolUse` 和 `PermissionRequest`。端点收到工具名为 `AskUserQuestion` 的 `PermissionRequest` 时，如果岛上没有在处理这个提问（例如第 3 期的开关没开，或用户点了「到终端处理」），要立即返回空决定，不能再挂一次。
- 自由文本回答可以做，提问卡片上一直显示输入框。
- 岛屿没运行时不影响 Agent，不需要额外兜底。
- Codex（0.4）还没测，第 2 期做 Codex 那部分之前补上。
