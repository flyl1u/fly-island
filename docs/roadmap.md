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
| B6 | Agent 岛上交互：音效、完成 / 审批 / 提问时自动弹出卡片、在岛上直接审批（Claude Code 和 Codex）和回答提问（仅 Claude Code） | 进行中 | 分期认领，见任务清单 | 方案和分期见 [agent-island-interaction.md](architecture/agent-island-interaction.md)，逐项进度见 [任务清单](architecture/agent-island-interaction-tasks.md)。第 0 期先实测钩子等待时终端审批框的行为；第 1 期的自动弹出提醒已完成，音效（1.1–1.4）等用户确认风格 |
| B3b | 卡片显示「正在压缩上下文」 | 待做 | | 会话记录里要等压缩完才有记录，只能靠 `PreCompact` / `PostCompact` 钩子；适合和 B6 的钩子通道一起做 |
| B4 | Claude 5 小时 / 7 天用量和 Codex 额度 | 进行中 | fly-island-fe · lane 4 · 2026-11-06 20:20 | Claude 部分已完成（提交 `feat(agent-status): Claude usage limits at the top of the Agent page`），Codex 待做。第一步读 claude-hud 写的用量快照（`externalUsagePath` / `externalUsageWritePath`，订阅账号来自 Claude Code 的 `rate_limits`，经 magpie 时来自网关）；Codex 额度第二步从 rollout 读。参考 [ClaudeBar](https://github.com/tddworks/ClaudeBar) |

## 第三优先：竞品都有、我们还缺的

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| C1 | 多显示器：每个屏幕一个岛，或岛跟着鼠标所在的屏幕 | 待做 | | Notchify、Isle Notch、WinIsland 都有 |
| C2 | 音量、亮度弹出提示 | 待做 | | |
| C3 | 蓝牙耳机电量；充电、耳机插拔提醒 | 待做 | | |
| C4 | 音乐页同步歌词 | 待做 | | 4 款以上竞品都有 |
| C5 | 日历和下一个会议 | 待做 | | 可以做成插件 |

竞品对比来源：[NotchPixel 对比 13 款](https://notchpixel.com/guides/dynamic-island-for-windows)、[Notchify 对比](https://notchify.app/en/compare/)、[Pillar](https://github.com/warpirate/pillar-dynamic-island-for-windows)。

## 第四优先：质量与发布

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| D1 | 测出空闲时的内存和 CPU 写进 README；确认 Agent 页每秒轮询不费电 | 进行中 | fly-island-fe · lane 4 · 2026-11-06 20:59 | 竞品都拿这个当卖点 |
| D2 | 无障碍检查：键盘操作、读屏提示（`aria`）、减少动效 | 待做 | | |
| D3 | 代码签名：Microsoft Store 或 Azure Trusted Signing | 待用户确认 | | 涉及费用 |
| D4 | 对比上游 0.2.15～0.2.19，列出值得移植的修复 | 待做 | | |
| D5 | 用装了旧版本的电脑完整走一遍应用内自动更新 | 待做 | | 需要用户操作 |
| D6 | 待办迁移备份文件只保留最近几个 | 待做 | | 覆盖问题已由 `e52809b` 修好，新文件不会再增加，旧的还留着 |
| D7 | 拆分 `scripts/file-size-allowlist.json` 里登记的超长文件 | 待做 | | 属于单独的重构 |
| D8 | 设置窗口结构调整：通用页「展开与收起」拆成「展开」和「贴边隐藏」，子项缩进挂在父开关下、父开关关闭时隐藏；统一「收起 / 贴边 / 最小化」术语和时间单位（秒）；通用页把语言放到后面；侧栏合并「插件扩展 / 插件市场」，考虑合并 QQ / 微信 / 邮箱；QQ、微信页的开关改成和其他页一样的行；快捷键页去掉标签下重复的组合键 | 进行中 | fly-island-lanes/3 | 用户已确认方案（侧栏不用彩色图标）。组件和「通用」页已完成，其余页面逐页迁移。视觉一步（卡片、字号层级、滑块横排）已完成，见下方「已完成」。用户提供了参考软件的设置页截图，完整方案和待确认的 6 个问题见 [settings-window-redesign.md](reviews/settings-window-redesign.md)，它取代这里列的做法。这一步会改文案和页面路由，要同步回归页 |

## 已完成

| # | 任务 | 提交 |
|---|---|---|
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
