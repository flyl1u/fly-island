# 待完善任务清单

这份清单汇总了 2026-11-06 的调研结论（竞品、Claude Code / Codex 官方钩子、各家如何从外部跳到终端标签），列出还需要完善的地方。**开发过程中实时维护**：

- 开始做某项前，先读 `origin/main` 上的这份清单；没人认领就单独提交一个只改这里的认领提交并立刻 land，再开始写代码。「负责」列写成 `会话名 · lane N · 认领时间`；认领 24 小时后 main 上仍没有相关提交，视为失效，可以接手。细则见 [AGENTS.md](../AGENTS.md)「文档」一节。
- 做完后改成「已完成」，填上提交号，并把它移到文末的「已完成」表格。
- 做的过程中发现新问题、或方案有变化，直接改对应条目的「备注」；新需求追加到合适的优先级里。
- 决定不做的，标「不做」，并在备注里写原因，不要直接删掉。

状态：`待做` / `进行中` / `已完成` / `不做` / `待用户确认`

## 第一优先：Agent 会话定位（对应“没找到对应的窗口”的反馈）

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| A7 | 核实 Codex 钩子的 `session_id` 和 rollout 里 `session_meta` 的 id 是同一个 | 待做 | | 文档没有明说，不一致的话 Codex 的会话记录对不上会话列表。需要在装了 Codex 的电脑上跑一次 |
| A8 | Codex 的 SessionStart 记录会让每个会话的第一轮晚约 1 秒（查进程要 1 秒，Codex 钩子还不支持后台运行） | 待做 | | Codex 支持 `async` 后改成后台运行；或改为钩子只记环境变量、由岛屿去查进程 |
| A6 | 收集一次真实 VS Code 环境下的 `agent-focus.log`，确认那位用户的问题是不是 `ddfcd05` 修好的那两种原因 | 待做 | | 需要那位用户更新后提供日志 |

## 第二优先：Agent 页体验

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| B2 | 会话完成或要确认时在岛上提醒：每个会话只留最新一条；所在窗口已在前台就不提醒 | 已完成 | fly-island-lanes/4 | 并入 B6 第 1 期，见任务清单 1.5–1.9 |
| B6 | Agent 岛上交互：音效、完成 / 审批 / 提问时自动弹出卡片、在岛上直接审批（Claude Code 和 Codex）和回答提问（仅 Claude Code） | 进行中 | 分期认领，见任务清单 | 方案和分期见 [agent-island-interaction.md](architecture/agent-island-interaction.md)，逐项进度见 [任务清单](architecture/agent-island-interaction-tasks.md)。第 0 期的 Claude Code 实测已完成（钩子等待时终端不显示审批框，结论见任务清单的「实测记录」），Codex（0.4）待补测；第 1 期的自动弹出提醒和音效（1.1–1.4、1.10）已完成，市场音效包（1.11）待做 |
| B3b | 卡片显示「正在压缩上下文」 | 待做 | | 会话记录里要等压缩完才有记录，只能靠 `PreCompact` / `PostCompact` 钩子；适合和 B6 的钩子通道一起做 |
| B4 | Claude 5 小时 / 7 天用量和 Codex 额度 | 待做 | | Claude 部分已完成（提交 `feat(agent-status): Claude usage limits at the top of the Agent page`，另见 B8、B10），Codex 待做：本机没有 Codex 会话记录无法验证，fly-island-fe 于 2026-11-07 放弃认领，需在装了 Codex 的电脑上做。第一步读 claude-hud 写的用量快照（`externalUsagePath` / `externalUsageWritePath`，订阅账号来自 Claude Code 的 `rate_limits`，经 magpie 时来自网关）；Codex 额度第二步从 rollout 读。参考 [ClaudeBar](https://github.com/tddworks/ClaudeBar) |

## 第三优先：竞品都有、我们还缺的

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| C1 | 多显示器：每个屏幕一个岛，或岛跟着鼠标所在的屏幕 | 待做 | | Notchify、Isle Notch、WinIsland 都有 |
| C3 | 蓝牙耳机电量；充电、耳机插拔提醒 | 待做 | | |
| C4b | 歌词的中文来源（网易云、QQ 音乐、酷狗，非官方接口、默认关闭并说明风险）、翻译行、逐字高亮、按单首歌调偏移 | 待做 | | LRCLIB 的中文歌收录较少。调研见 C4 的会话记录：BetterLyrics、Lyricify 用的就是这几家。网易云不向系统报告播放进度和时长，岛只能从切歌起自己计时，在网易云里拖进度条或岛打开时歌已放到一半都会对不上；拿到网易云的歌曲 ID 或进度需要它的插件（如 InfLink-rs），以后可以考虑 |
| C5 | 日历和下一个会议 | 待做 | | 可以做成插件 |

竞品对比来源：[NotchPixel 对比 13 款](https://notchpixel.com/guides/dynamic-island-for-windows)、[Notchify 对比](https://notchify.app/en/compare/)、[Pillar](https://github.com/warpirate/pillar-dynamic-island-for-windows)。

## 第四优先：质量与发布

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| D1 | 测出空闲时的内存和 CPU 写进 README；确认 Agent 页每秒轮询不费电 | 已完成 | fly-island-fe · lane 4 | `cef6251`、`376c9cb`，数据见 [idle-usage.md](investigations/idle-usage.md)：收起闲着约单核 10%、330 MB；Agent 页每秒刷新 0.1% |
| D2 | 无障碍检查：键盘操作、读屏提示（`aria`）、减少动效 | 待做 | | |
| D3 | 代码签名：Microsoft Store 或 Azure Trusted Signing | 待用户确认 | | 涉及费用 |
| D4 | 对比上游 0.2.15～0.2.19，列出值得移植的修复 | 待做 | | |
| D5 | 用装了旧版本的电脑完整走一遍应用内自动更新 | 待做 | | 需要用户操作 |
| D7 | 拆分 `scripts/file-size-allowlist.json` 里登记的超长文件 | 待做 | | 属于单独的重构 |
| D8 | 设置窗口结构调整：通用页「展开与收起」拆成「展开」和「贴边隐藏」，子项缩进挂在父开关下、父开关关闭时隐藏；统一「收起 / 贴边 / 最小化」术语和时间单位（秒）；通用页把语言放到后面；侧栏合并「插件扩展 / 插件市场」，考虑合并 QQ / 微信 / 邮箱；QQ、微信页的开关改成和其他页一样的行；快捷键页去掉标签下重复的组合键 | 待做 | | 用户已确认方案（侧栏不用彩色图标）。组件和「通用」页已完成，其余页面逐页迁移（声音页、AI Agent 页的新分组已用新组件）；fly-island-67 于 2026-11-06 放弃认领，可以接手。视觉一步（卡片、字号层级、滑块横排）已完成，见下方「已完成」。用户提供了参考软件的设置页截图，完整方案和待确认的 6 个问题见 [settings-window-redesign.md](reviews/settings-window-redesign.md)，它取代这里列的做法。这一步会改文案和页面路由，要同步回归页 |

## 已完成

| # | 任务 | 提交 |
|---|---|---|
| D6 | 待办重新导入前的备份 `todos.before-reimport-*.json` 每次启动只留最近 3 个。原文备份 `todos-migration-backup*.json` 不删：岛屿靠它们的 `sourceHash` 认出另一个构建的旧副本（`e52809b`），删了会重新出现切换构建覆盖待办的问题，而且它们很小 | 提交 `fix(todos): keep only the newest three reimport copies` |
| B10 | magpie 网关用户的用量：Claude Code 的 `ANTHROPIC_BASE_URL` 指向本机时，岛屿带着 Claude Code 给网关的令牌请求 magpie 的 `GET /v1/magpie/quotas`（每分钟至多一次，只请求本机），不需要 claude-hud 和中间脚本；有数据时优先于 claude-hud 快照，卡片注明「来自 magpie」。`?kept=1` 在实际网关上返回空列表，所以没用。窗口按显示名（"5 hours"、"7 days"、"7 days · 模型"）对应，magpie 改措辞会对不上；分不出 Max / Ultra | 提交 `feat(agent-status): read Claude usage from a local magpie gateway` |
| B9 | 回复状态标记（默认关）：设置 → AI Agent 打开后，往 `~/.claude/CLAUDE.md` 末尾加一段带起止标记的说明，让 Claude Code 每次回复最后一行写 `↩` 等你回复、`⋯` 等后台任务、`✓` 做完了；会话列表从会话记录读这一行（不改 Stop 钩子），会话环和 Agent 页据此区分「等你回复」和「做完了」。说明文字自己写，没有用 claude-sessions 的原文。B6 的完成提醒还没分成两种，以后需要时再做 | 提交 `feat(agent-status): optional reply status marker tells "your turn" from "done"` |
| B8 | 用量环可选「直接向 Anthropic 查询」（默认关）：只读 Claude Code 凭据里的 token，经代理（插件设置 → `HTTPS_PROXY` → Windows 系统代理）请求 `api.anthropic.com/api/oauth/usage`，不直连；刷新间隔 5–120 分钟，9 种失败提示；与 claude-hud 快照取较新的，Agent 页顶部和用量环共用。移植自 TixXin/fly-island#3 的 `claude_usage/`；接口未公开，可能随时失效 | 提交 `feat(claude-usage): optionally ask Anthropic for Claude usage directly` |
| B7 | 合入 TixXin/fly-island#3（ShengLin1001）：收起条视觉打磨、插槽与 MiniRing、内置插件「中心图案」「Claude 用量环」「Agent 会话环」。用量环改读 claude-hud 用量快照（不读凭据、不联网）；会话环改用岛屿自己的会话列表（不依赖 claude-sessions） | 提交 `feat(claude-usage): Claude usage double ring on the collapsed bar`、`feat(session-ring): agent session ring in place of the blue session count` 及之前从 PR 摘取的 7 个提交 |
| C4 | 音乐页同步歌词：找到带时间轴的歌词时，在波形上方显示上一句、当前句、下一句（波形缩成细条），播放时按本地时钟往下走；先找用户的 .lrc 文件夹，再查 LRCLIB（默认关闭，开启后发送歌名、歌手、专辑和时长，结果缓存）；按时长（±3 秒）和歌手核对，不硬配；可调提前或推后。网易云、QQ 音乐等非官方来源和逐字歌词暂不做 | 提交 `feat(media): synced lyrics on the music page` |
| C2 | 音量、亮度弹出提示：后台线程每 0.1 秒读默认输出的音量和静音、每 0.4 秒读笔记本屏幕亮度（WMI，外接显示器读不到），变化时收起的小岛显示图标、进度条和百分比 1.5 秒；设置 → 通用 → 音量与亮度可关，关掉后不再读取 | 提交 `feat(island): show the volume or brightness when it changes` |
| B6b | 会话开始也弹出提醒：默认每一轮开始都弹，设置里可改成只在新会话开始时弹或不弹 | 提交 `feat(agent-status): alerts when a session starts` |
| B6c | 完成 / 出错的弹出卡片显示 AI 最后的回复：Rust 读回复时按行去掉 Markdown 符号，上限从 120 字提到 200 字；卡片最多 3 行，岛屿高度按卡片这一行的实际高度。Agent 页列表里结束的会话仍折叠成一行 | 提交 `feat(agent-status): alert cards show the session's last reply` |
| B6a | 自动弹出提醒只显示触发的那一个会话（面板一行高、不显示用量），不再展开整个 Agent 页列表；点岛上别处、切页或收起后回到完整列表 | 提交 `fix(agent-status): an alert shows only its own session` |
| C6 | 摄像头、麦克风正在使用的提示：读 Windows 的 `CapabilityAccessManager\ConsentStore`（任务栏隐私图标读的同一处），每 2 秒一次；折叠岛上显示绿色摄像头、橙色麦克风，点击打开系统隐私设置；设置 → 通用 → 隐私提示可关 | 提交 `feat(island): show when an app uses the camera or the microphone` |
| B1 | Agent 页上跑完或出错、还没看过的会话保持高亮（标题亮色、状态灯发光），在 Agent 页点过或它的窗口到了前台才变灰；新命令 `agent_sessions_in_front`（按会话进程链判断窗口是否在前台），B6 的智能抑制可以直接用 | 提交 `feat(agent-status): finished sessions stay bright until looked at` |
| B3 | 运行中的会话卡片标出不是默认的权限模式（跳过确认、自动、自动改文件、计划；Codex 按 approval / sandbox 策略）和正在跑的子 Agent 数（后台子 Agent 不计）。压缩上下文拆成 B3b | 提交 `feat(agent-status): mark the permission mode and running subagents on session cards` |
| B5 | 关掉「显示 Claude Code / Codex 会话」后，被关掉的 Agent 也不再点亮折叠岛、不出现在状态文字里（会话标题早已跟随开关） | 提交 `fix(agent-status): agents switched off in settings no longer light the island` |
| A2 | VS Code 精确跳到终端：扩展 `packages/vscode-extension/`（ID `tixxin.focusd-island`）按进程号或标题切到会话的终端，岛屿在编辑器装了扩展时才打开链接。用处窄，不上架扩展市场、不发 Release，需要时自己打包 .vsix 安装 | `a407cb2` |
| A3 | Windows Terminal 跳到标签：调出窗口后用 UI Automation 读标签名，只有恰好一个标签是会话标题时选中它（标题被截断时按开头匹配），标签在同一进程的另一个窗口里时调出那个窗口；日志写 `wt-tab=selected/none`。没有用 `WT_SESSION`：UIA 拿不到标签的会话 ID | 提交 `feat(agent-status): switch to the session's Windows Terminal tab` |
| E6 | 插件右键菜单扩展到剪贴板文字、文件中转、QQ 通知和邮件（`clipboard/context`、`shelf/context`、`message/context`） | 提交 `feat(plugins): plugin entries in the clipboard, shelf and message right-click menus` |
| — | 设置窗口视觉层级：分区卡片、字号层级代替加粗、滑块横排 | 提交 `feat(settings): cards and a type scale instead of bold everywhere` |
| E5 | 插件修改自己声明的设置（`settings.set`） | `24efe79` |
| E4 | 插件媒体控制：拖进度、音量、随机、循环、封面 | `3dd05f5` |
| E3 | 插件事件：`shelf.changed`，锁屏 / 睡眠 / 空闲系统事件 | `ea1f9bc` |
| E2 | 插件按日期读取待办和笔记，`todos.days` | `25f0291` |
| E1 | 插件在用户刚用过后打开自己的页面（`island.openView`） | `3792c19` |
| A1、A4、A5 | 用官方 SessionStart / SessionEnd 钩子记录会话进程、启动时间和终端（`agent-sessions/`，Claude Code 后台运行）；Codex 接上 SessionStart / SessionEnd / PermissionRequest；等待确认改用 PermissionRequest 和 `agent_needs_input`，Codex 也能显示等待确认 | 提交 `feat(agent-status): record sessions with the documented hooks` |
| — | 点击会话找不到窗口：`/clear` 后找回、Windows 拒绝切前台时改用其他方式、VS Code 标题标记、Orca 按标题找标签、`agent-focus.log` | `ddfcd05` |
| — | 会话运行时长，Agent 设置页更多选项 | `3597475` |
| — | 已开着的 Orca 会话不用 `/resume` 也能切到标签；Codex 按目录找标签 | `c665312` |
| — | 折叠状态的更新提醒 | `58ffbc9` |
| — | 设置导出与恢复 | `162656e` |
| — | 待办在不同构建间被旧数据覆盖 | `e52809b` |
| — | 固定 Rust 版本 | `b0c8893` |
