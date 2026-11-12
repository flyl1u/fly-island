# 数据存放位置

| 数据 | 位置 | 负责方 |
|---|---|---|
| 设置、预设、各功能开关、语言 | WebView2 的 `localStorage` | 前端各 feature 的 `storage.ts` |
| 锁定小岛位置、独立设置窗口 | 同一 WebView2 `localStorage`：`focusd-island-settings.positionLocked`（默认 false）、`focusd-island-detached-settings`（缺失时默认 `"true"`，保留已保存的选择） | `features/appearance/storage.ts`、`windows/settings/storage.ts` |
| 待办、以后的待办、每日笔记、归档、正在进行的待办、待办日期 | WebView2 的 `localStorage`（`focusd-island-todos` 等 key，见 [contracts.md](contracts.md)） | `features/todos/storage.ts` |
| AI 代理状态与运行标记、hook 脚本 | 应用数据目录（`agent-status.json`、`agent-*-running*.flag`、`focusd-agent-*.{cmd,ps1}`；`agent-sessions/<会话 ID>.json` 是 SessionStart / SessionEnd 钩子（`focusd-agent-session.ps1`）记下的会话进程、启动时间、终端和结束原因，优先于 Claude Code 未公开的 `~/.claude/sessions`；`agent-codex-notification.json` 是 Codex PermissionRequest 钩子的输入，用于判断 Codex 会话是否在等待确认；`agent-sessions-seen.json` 记下见过的会话的进程、启动时间、所在程序和 Orca 终端，保留两天，用于 `/clear`、结束后的会话找回窗口；`agent-focus.log` 是点击会话切换窗口的排查日志（只有步骤和程序名）；`agent-terminals/<Orca 终端 handle>.json` 为 Claude Code SessionStart hook 的输入，只在 Orca 终端里写，用来从会话切到它的 Orca 标签；`agent-claudeCode-notification.json` 为 Claude Code 最近一次"等待授权 / 等待输入"通知的 hook 输入，只用于判断会话是否在等你，清除状态时删除；旧版保存的 `agent-*-hook-input.json` 在安装/修复时删除；`agent-remote-hosts.json` 是设置 → AI Agent → 远程电脑里打开的主机，以及在那一页添加的主机（`custom`：名称、用户名、地址、端口；岛屿不改 `~/.ssh/config`）；`remote-sessions/<Host>/` 是从这些机器读来的会话文件节选，按家目录结构存放、保留远端修改时间，离开会话时间窗口的文件在下次读取时删除） | `agent_status`（会话列表在 `sessions.rs`、`session_scan.rs`，等待判断在 `notifications.rs`，远程机器在 `remote_hosts.rs`、`remote_fetch.rs`、`remote_sessions.rs`，标题与提问文字处理在 `title.rs`） |
| 文件中转列表（只存路径，不复制文件） | 应用数据目录（`file-shelf.json`） | `file_shelf` |
| 设置窗口上次关闭时的大小与位置（位置已不在任何屏幕上时忽略） | 应用数据目录（`settings-window.json`） | `settings_window/bounds.rs` |
| 审批端点端口与访问令牌（装进 Claude Code / Codex 的 PermissionRequest 钩子）；首选端口 47830，被占用时换端口并写回 | 应用数据目录（`agent-approval.json`） | `agent_approval` |
| 回复状态标记（B9，默认关）：Claude Code 全局指令末尾的一段说明，起止为 `<!-- focusd-island: reply marker v1 -->` 与 `<!-- /focusd-island: reply marker -->`，只增删这一段；会话列表读回复最后一行的 `↩` / `⋯` / `✓`，作为 `AgentSessionSummary.replyMarker`（`yourTurn` / `background` / `done`），并从显示的回复里去掉这一行 | `%CLAUDE_CONFIG_DIR%` 或 `~/.claude/CLAUDE.md`；Tauri 命令 `get_reply_marker_state`、`set_reply_marker` | `agent_status/reply_marker.rs` |
| magpie 网关的用量（B10）：Claude Code 的 `ANTHROPIC_BASE_URL` 指向本机（`localhost` / 回环地址）时，带着 `ANTHROPIC_AUTH_TOKEN`（或 `ANTHROPIC_API_KEY`）请求 `GET <base>/v1/magpie/quotas`，每分钟至多一次，非 404 失败下一分钟再试，404 视为不是 magpie、10 分钟后再试；不走代理、不跟随重定向，令牌只发往这个本机地址；有数据时优先于 claude-hud 快照，`get_agent_usage` 的 `source` 为 `magpie` | 只读 `~/.claude/settings.json`（或 `CLAUDE_CONFIG_DIR`）的 `env`，没有时读进程环境变量；结果只在内存中 | `agent_status/magpie.rs` |
| Claude 桌面版的用量：Claude 桌面版每次向 Anthropic 取用量（打开时约每 15 分钟）都会往自己的数据目录追加一条样本（`t` 毫秒时间、`org`、`u.fh` 5 小时已用 %、`u.sd` 7 天已用 %，以及 `so` / `sn` 等按模型的周窗口；version 1 把 `fh` / `sd` 直接放在样本里）。取所有安装里最新的一条；样本没有重置时间，所以比窗口长度还旧的窗口不显示（5 小时的超过 5 小时、7 天的超过 7 天）。没有 magpie 时，和 claude-hud 快照比谁更新就用谁，`source` 为 `claudeDesktop`；不联网、不读登录 | 只读 `plan-usage-history.json`：`%APPDATA%\Claude\`、商店版的 `%LOCALAPPDATA%\Claude-Data\<包>\` 或 `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`（也看其下 `appdata\`），至多读 4 MiB | `agent_status/claude_desktop_usage.rs` |
| Codex 用量（B4）：Agent 页的 Codex 额度环。读 Codex 自己写的会话记录里最新一个带额度的 `token_count` 事件（`rate_limits` 的 `primary` / `secondary`，按 `window_minutes` 分：一天以内为 5 小时、八天以内为 7 天，更长的（免费账号的 30 天窗口 43200）按天数单列为 "30d"；窗口为 null 的跳过；`limit_id` 不是 `codex` 的事件（其他额度桶）跳过；取各文件里事件时间最新的一条，不按文件修改时间——换账号后旧会话文件可能更晚被改动，但里面是旧账号的额度），每 30 秒读一次；不联网、不读 Codex 登录；Tauri 命令 `get_codex_usage`，返回和 `get_agent_usage` 相同的结构，`source` 为 `codex` | 只读 `%CODEX_HOME%` 或 `~/.codex/sessions/<年>/<月>/<日>/rollout-*.jsonl`（含长对话的分页 `-<thread>_<页>.jsonl`；最近 7 天、最新 20 个文件，各读末尾 256 KiB），以及 `archived_sessions/rollout-*.jsonl`（压缩的 `.jsonl.zst` 不读） | `agent_status/codex_usage.rs` |
| Codex / Claude Code hook 配置 | `~/.codex/config.toml`、`~/.claude/settings.json` 中带标记的受管区块 | `agent_status` |
| QQ 邮箱授权码、翻译 API 密钥 | Windows 凭据管理器（`com.focusd.island.qq-mail`、`com.focusd.island.translation`；翻译密钥按服务分条目，用户名为服务 id，DeepSeek 沿用 `deepseek`） | `qq_mail`、`translation` |
| 待办 Markdown 导出 | 用户选择的目录（经过校验） | `system` |
| 开机自启 | `HKCU\...\Run` 下的值 `FocuSD Island` | `system` |
| 剪贴板历史、通知、微信消息摘要、邮件正文 | 仅保存在内存中 | 各服务模块 |
| 微信摘要和最小化时隐藏任务栏图标的偏好 | WebView2 的 `localStorage`，见 [对外契约](contracts.md) | `features/messages/wechat/storage.ts` |
| 微信辅助功能恢复记录 | 应用数据目录（`wechat-accessibility.json`），记录进程 ID 和启动时间 | `wechat_reminders/accessibility.rs` |

总览见 [overview.md](overview.md)。
