# 数据存放位置

| 数据 | 位置 | 负责方 |
|---|---|---|
| 设置、预设、各功能开关、语言 | WebView2 的 `localStorage` | 前端各 feature 的 `storage.ts` |
| 待办、以后的待办、每日笔记、归档、正在进行的待办、待办日期（2026-11 起；更早的版本存在 `localStorage`，首次启动时迁移） | 应用数据目录（`todos.json`；迁移时的原文备份 `todos-migration-backup.json` / `todos-migration-backup-<毫秒>.json`；旧版本改过数据后重新导入前的备份 `todos.before-reimport-<毫秒>.json`，只留最近 3 个；原文备份不会自动删除，岛屿靠它们的 `sourceHash` 认出另一个构建的旧副本） | `todos`（Rust）、`features/todos/todoStore.ts` |
| AI 代理状态与运行标记、hook 脚本 | 应用数据目录（`agent-status.json`、`agent-*-running*.flag`、`focusd-agent-*.{cmd,ps1}`；`agent-sessions/<会话 ID>.json` 是 SessionStart / SessionEnd 钩子（`focusd-agent-session.ps1`）记下的会话进程、启动时间、终端和结束原因，优先于 Claude Code 未公开的 `~/.claude/sessions`；`agent-codex-notification.json` 是 Codex PermissionRequest 钩子的输入，用于判断 Codex 会话是否在等待确认；`agent-sessions-seen.json` 记下见过的会话的进程、启动时间、所在程序和 Orca 终端，保留两天，用于 `/clear`、结束后的会话找回窗口；`agent-focus.log` 是点击会话切换窗口的排查日志（只有步骤和程序名）；`agent-terminals/<Orca 终端 handle>.json` 为 Claude Code SessionStart hook 的输入，只在 Orca 终端里写，用来从会话切到它的 Orca 标签；`agent-claudeCode-notification.json` 为 Claude Code 最近一次"等待授权 / 等待输入"通知的 hook 输入，只用于判断会话是否在等你，清除状态时删除；旧版保存的 `agent-*-hook-input.json` 在安装/修复时删除；`agent-remote-hosts.json` 是设置 → AI Agent → 远程服务器里选中的 SSH Host；`remote-sessions/<Host>/` 是从这些机器读来的会话文件节选，按家目录结构存放、保留远端修改时间，离开会话时间窗口的文件在下次读取时删除） | `agent_status`（会话列表在 `sessions.rs`、`session_scan.rs`，等待判断在 `notifications.rs`，远程机器在 `remote_hosts.rs`、`remote_fetch.rs`、`remote_sessions.rs`，标题与提问文字处理在 `title.rs`） |
| Claude 用量（5 小时 / 7 天），用量环打开「直接向 Anthropic 查询」时（默认关）：只读 Claude Code 的 access token，不刷新、不写凭据；令牌不进日志、前端和事件；结果只在内存中，与 claude-hud 快照合并后由 `get_agent_usage` 返回（新增字段 `source`：`hud` / `api`，`error`：`{ kind, message }`） | 只读 `%CLAUDE_CONFIG_DIR%` 或 `~/.claude/.credentials.json`；代理来自插件设置、`HTTPS_PROXY` 或注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` 的 `ProxyEnable` / `ProxyServer` | `claude_usage`、`agent_status/usage.rs` |
| 文件中转列表（只存路径，不复制文件） | 应用数据目录（`file-shelf.json`） | `file_shelf` |
| 折叠态中心图案用的宠物包（petdex 格式 `pet.json` + `spritesheet.webp/png`；只读，应用从不写入） | 应用数据目录 `pets/<id>/`（同名优先）和 `~/.codex/pets/<id>/` | `pets` |
| 设置窗口上次关闭时的大小与位置（位置已不在任何屏幕上时忽略） | 应用数据目录（`settings-window.json`） | `settings_window/bounds.rs` |
| 插件：已安装插件、启用与授权状态、插件私有数据 | 应用数据目录（`plugins/<id>/`、`plugins.json`、`plugins-data/<id>/`，见 [docs/plugins/README.md](../plugins/README.md)） | `plugin_host` |
| 审批端点端口与访问令牌（装进 Claude Code / Codex 的 PermissionRequest 钩子）；首选端口 47830，被占用时换端口并写回 | 应用数据目录（`agent-approval.json`） | `agent_approval` |
| 本地接口端口与访问令牌（脚本也会读取）；开关与"允许修改"由内置插件 `focusd.local-api` 在 `plugins.json` 中保存，并同步写入此文件供脚本参考 | 应用数据目录（`local-api.json`，见 [docs/local-api.md](../local-api.md)） | `local_api`、`plugin_host/builtin.rs` |
| 回复状态标记（B9，默认关）：Claude Code 全局指令末尾的一段说明，起止为 `<!-- focusd-island: reply marker v1 -->` 与 `<!-- /focusd-island: reply marker -->`，只增删这一段；会话列表读回复最后一行的 `↩` / `⋯` / `✓`，作为 `AgentSessionSummary.replyMarker`（`yourTurn` / `background` / `done`），并从显示的回复里去掉这一行 | `%CLAUDE_CONFIG_DIR%` 或 `~/.claude/CLAUDE.md`；Tauri 命令 `get_reply_marker_state`、`set_reply_marker` | `agent_status/reply_marker.rs` |
| magpie 网关的用量（B10）：Claude Code 的 `ANTHROPIC_BASE_URL` 指向本机（`localhost` / 回环地址）时，带着 `ANTHROPIC_AUTH_TOKEN`（或 `ANTHROPIC_API_KEY`）请求 `GET <base>/v1/magpie/quotas`，每分钟至多一次，非 404 失败下一分钟再试，404 视为不是 magpie、10 分钟后再试；不走代理、不跟随重定向，令牌只发往这个本机地址；有数据时优先于 claude-hud 快照，`get_agent_usage` 的 `source` 为 `magpie` | 只读 `~/.claude/settings.json`（或 `CLAUDE_CONFIG_DIR`）的 `env`，没有时读进程环境变量；结果只在内存中 | `agent_status/magpie.rs` |
| Codex 用量（B4）：Agent 页第二行用量。读 Codex 自己写的会话记录里最新一个带额度的 `token_count` 事件（`rate_limits` 的 `primary` / `secondary`，按 `window_minutes` 分 5 小时和 7 天，窗口为 null 的跳过），每 30 秒读一次；不联网、不读 Codex 登录；Tauri 命令 `get_codex_usage`，返回和 `get_agent_usage` 相同的结构，`source` 为 `codex` | 只读 `%CODEX_HOME%` 或 `~/.codex/sessions/<年>/<月>/<日>/rollout-*.jsonl`（最近 7 天、最新 20 个文件，各读末尾 256 KiB） | `agent_status/codex_usage.rs` |
| Codex / Claude Code hook 配置 | `~/.codex/config.toml`、`~/.claude/settings.json` 中带标记的受管区块 | `agent_status` |
| QQ 邮箱授权码、翻译 API 密钥、日历订阅链接和 CalDAV 密码 | Windows 凭据管理器（`com.focusd.island.qq-mail`、`com.focusd.island.calendar`、`com.focusd.island.translation`；翻译密钥按服务分条目，用户名为服务 id，DeepSeek 沿用 `deepseek`） | `qq_mail`、`translation` |
| 待办 Markdown 导出 | 用户选择的目录（经过校验） | `system` |
| 开机自启 | `HKCU\...\Run` 下的值 `FocuSD Island` | `system` |
| 剪贴板历史、通知、邮件正文 | 仅保存在内存中 | 各服务模块 |

总览见 [overview.md](overview.md)。
