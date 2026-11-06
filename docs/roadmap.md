# 待完善任务清单

这份清单汇总了 2026-11-06 的调研结论（竞品、Claude Code / Codex 官方钩子、各家如何从外部跳到终端标签），列出还需要完善的地方。**开发过程中实时维护**：

- 开始做某项时，把状态改成「进行中」并写上负责的会话（例如 `fly-island-7e`），避免两个会话做同一件事。
- 做完后改成「已完成」，填上提交号，并把它移到文末的「已完成」表格。
- 做的过程中发现新问题、或方案有变化，直接改对应条目的「备注」；新需求追加到合适的优先级里。
- 决定不做的，标「不做」，并在备注里写原因，不要直接删掉。

状态：`待做` / `进行中` / `已完成` / `不做` / `待用户确认`

## 第一优先：Agent 会话定位（对应“没找到对应的窗口”的反馈）

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| A2 | VS Code 精确跳到终端：做一个小扩展，注册 `vscode://` 链接，按进程号找到终端并 `terminal.show()`；没装扩展时只调窗口。Cursor、Windsurf 等同样适用 | 待用户确认 | | VS Code 没有从外部选中终端的接口，做法参考 [agents-deck #17](https://github.com/brushknight/agents-deck/issues/17)。发布到扩展市场属于对外发布，开始前要先问用户 |
| A3 | Windows Terminal 跳到标签：用 UI Automation 按会话标题选中标签，失败时只调窗口 | 待做 | | 会话记录里已经有 `WT_SESSION`，可以用来确认是哪个标签。微软拒绝了按会话 ID 切标签的接口（[terminal #19783](https://github.com/microsoft/terminal/issues/19783)），只能按序号或用 UIA |
| A7 | 核实 Codex 钩子的 `session_id` 和 rollout 里 `session_meta` 的 id 是同一个 | 待做 | | 文档没有明说，不一致的话 Codex 的会话记录对不上会话列表。需要在装了 Codex 的电脑上跑一次 |
| A8 | Codex 的 SessionStart 记录会让每个会话的第一轮晚约 1 秒（查进程要 1 秒，Codex 钩子还不支持后台运行） | 待做 | | Codex 支持 `async` 后改成后台运行；或改为钩子只记环境变量、由岛屿去查进程 |
| A6 | 收集一次真实 VS Code 环境下的 `agent-focus.log`，确认那位用户的问题是不是 `ddfcd05` 修好的那两种原因 | 待做 | | 需要那位用户更新后提供日志 |

## 第二优先：Agent 页体验

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| B1 | 「已完成但还没看」状态：跑完后高亮，点开看过才变灰 | 待做 | | 参考 [Session Drawer](https://github.com/msziva/session-drawer) |
| B2 | 会话完成或要确认时在岛上提醒：每个会话只留最新一条；所在窗口已在前台就不提醒 | 待做 | | 同上 |
| B3 | 卡片显示权限模式（auto / bypass 标记）、正在压缩上下文、子 Agent 数量 | 待做 | | 钩子输入里有 `permission_mode`；事件有 `PreCompact` / `PostCompact`、`SubagentStart` / `SubagentStop` |
| B4 | Claude 5 小时 / 7 天用量和 Codex 额度 | 待做 | | 先调研数据来源。参考 [ClaudeBar](https://github.com/tddworks/ClaudeBar) |
| B5 | 折叠状态的会话标题也跟随「显示 Claude Code / Codex 会话」开关 | 待做 | | `3597475` 留下的已知问题 |

## 第三优先：竞品都有、我们还缺的

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| C1 | 多显示器：每个屏幕一个岛，或岛跟着鼠标所在的屏幕 | 待做 | | Notchify、Isle Notch、WinIsland 都有 |
| C2 | 音量、亮度弹出提示 | 待做 | | |
| C3 | 蓝牙耳机电量；充电、耳机插拔提醒 | 待做 | | |
| C4 | 音乐页同步歌词 | 待做 | | 4 款以上竞品都有 |
| C5 | 日历和下一个会议 | 待做 | | 可以做成插件 |
| C6 | 摄像头、麦克风正在使用的提示 | 待做 | | 隐私相关 |

竞品对比来源：[NotchPixel 对比 13 款](https://notchpixel.com/guides/dynamic-island-for-windows)、[Notchify 对比](https://notchify.app/en/compare/)、[Pillar](https://github.com/warpirate/pillar-dynamic-island-for-windows)。

## 插件 API 补全

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| E6 | 更多右键菜单扩展点：剪贴板条目、文件中转条目、消息条目（`contributes.menus`） | 进行中 | fly-island-lanes/2 | 现在只有待办右键菜单 |

## 第四优先：质量与发布

| # | 任务 | 状态 | 负责 | 备注 |
|---|---|---|---|---|
| D1 | 测出空闲时的内存和 CPU 写进 README；确认 Agent 页每秒轮询不费电 | 待做 | | 竞品都拿这个当卖点 |
| D2 | 无障碍检查：键盘操作、读屏提示（`aria`）、减少动效 | 待做 | | |
| D3 | 代码签名：Microsoft Store 或 Azure Trusted Signing | 待用户确认 | | 涉及费用 |
| D4 | 对比上游 0.2.15～0.2.19，列出值得移植的修复 | 待做 | | |
| D5 | 用装了旧版本的电脑完整走一遍应用内自动更新 | 待做 | | 需要用户操作 |
| D6 | 待办迁移备份文件只保留最近几个 | 待做 | | 覆盖问题已由 `e52809b` 修好，新文件不会再增加，旧的还留着 |
| D7 | 拆分 `scripts/file-size-allowlist.json` 里登记的超长文件 | 待做 | | 属于单独的重构 |
| D8 | 设置窗口结构调整：通用页「展开与收起」拆成「展开」和「贴边隐藏」，子项缩进挂在父开关下、父开关关闭时隐藏；统一「收起 / 贴边 / 最小化」术语和时间单位（秒）；通用页把语言放到后面；侧栏合并「插件扩展 / 插件市场」，考虑合并 QQ / 微信 / 邮箱；QQ、微信页的开关改成和其他页一样的行；快捷键页去掉标签下重复的组合键 | 待用户确认 | | 视觉一步（卡片、字号层级、滑块横排）已完成，见下方「已完成」。这一步会改文案和页面路由，要同步回归页 |

## 已完成

| # | 任务 | 提交 |
|---|---|---|
| — | 设置窗口视觉层级：分区卡片、字号层级代替加粗、滑块横排 | 提交 `feat(settings): cards and a type scale instead of bold everywhere` |
| E5 | 插件修改自己声明的设置（`settings.set`） | 提交 `feat(plugins): let a plugin change its own settings` |
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
