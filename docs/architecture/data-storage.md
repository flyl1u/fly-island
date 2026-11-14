# 数据存放位置

| 数据 | 位置 | 负责方 |
|---|---|---|
| 待办行为设置 | 现有 `focusd-island-settings`：`todoTimerEnabled` 默认 false；`enableTodoReorder` 默认 true，`todoReorderVersion: 1` 表示已迁移；无标记的旧数据开启拖拽，有标记才读取保存的布尔值。关闭番茄钟清除本轮计时，保留进行中 ID | `features/appearance/settingsDefaults.ts`、`normalizeBehaviorSettings.ts`；沿用跨窗口 storage 同步 |
| 设置、预设、各功能开关、语言 | WebView2 的 `localStorage` | 前端各 feature 的 `storage.ts` |
| 岛屿字号、刘海基准尺寸、额度环筛选 | `focusd-island-settings`，字段见 [对外契约](contracts.md) | `features/appearance/` |
| WorkBuddy 官网登录与余额 | `%LOCALAPPDATA%/com.focusd.island/workbuddy-web/WebView2` 保存独立浏览器配置。同级 `connected` 文件记录已成功连接。积分汇总缓存在内存，选中额度环时刷新，有效结果缓存 5 分钟。断开时清除该配置的浏览数据和连接标记 | `agent_status/workbuddy_connection.rs`、`agent_status/workbuddy_usage.rs` |
| 贴边收起样式 | 原有 `focusd-island-settings` 对象的 `tuckStyle` 字段：`edge` / `line` / `hidden`，缺失或非法值按 `edge`；沿用跨窗口 storage 同步，不新增文件或 key | `features/appearance/storage.ts`、`settingsDefaults.ts`、`normalizeBehaviorSettings.ts`；通过 `windows/island/useIslandWindow.ts` 同步至原生内存状态 |
| 三色刷新和上一版颜色 | 同一 `localStorage`：`focusd-island-color-refresh-v1` 为 `"1"` 时不再刷新；`focusd-island-color-backup` 保存 `{ islandBackgroundColor, taskTextColor, pulseColor }`（大写 `#RRGGBB`），批量改色先备份，回退交换当前 / 备份；新用户或三色已匹配新默认值时只写标记、不新建备份，损坏备份视为空 | `features/appearance/storage.ts`；迁移流程 `colorRefresh.ts`、格式校验 `colorPalette.ts` |
| 会话排序默认值迁移 | 同一 `localStorage`：`focusd-island-session-sort-recent-v1` 为 `"1"` 时不再迁移；首次加载时把已存的 `agentSessionSort: "status"`（旧默认值）改为 `"recent"` | `features/appearance/storage.ts` |
| 颜色预设 | 同一 `localStorage`：新 key `focusd-island-color-presets`，数组项 `{ id, islandBackgroundColor, taskTextColor, pulseColor }`，三色为大写 `#RRGGBB`；去重、最多 8 项，应用前写三色备份；与退役的外观预设 key 无关 | `features/appearance/storage.ts`、`colorPresets.ts`、`ColorPresetRow.tsx` |
| 自动更新开关 | 同一 `localStorage`：`focusd-island-auto-update`，只有 `"false"` 表示关闭，缺失算开启。由打开「关于」的窗口写入；独立设置窗口再通过 `focusd-update-request` 告诉主窗口，主窗口负责定时检查和安装 | `features/updater/storage.ts`、`updaterController.ts` |
| 交流群红点 | 同一 `localStorage`：`focusd-island-community-invite-seen`，点开「关于」里的用户交流群后写 `"true"`，各窗口靠 storage 事件同步。群二维码不存本地，每次点开从官网 `island.flyliu.org/community/wechat-group.jpg` 加载（微信每周换码，换官网上的图即可） | `features/updater/storage.ts`、`useCommunityInvite.ts` |
| 锁定小岛位置、独立设置窗口 | 同一 WebView2 `localStorage`：`focusd-island-settings.positionLocked`（默认 false）、`focusd-island-detached-settings`（缺失时默认 `"true"`，保留已保存的选择） | `features/appearance/storage.ts`、`windows/settings/storage.ts` |
| 待办、以后的待办、每日笔记、归档、正在进行的待办、待办日期 | WebView2 的 `localStorage`（`focusd-island-todos` 等 key，见 [contracts.md](contracts.md)） | `features/todos/storage.ts` |
| 待办倒计时与各项时长 | 同一 `localStorage`：`focusd-island-todo-timer` 保存 `{ todoId, endsAt, durationMinutes, notified }`，以结束时间恢复剩余秒数；`focusd-island-todo-durations` 按待办 id 保存 1–240 的整数分钟（没有记录按 15 分钟；旧的共用 `focusd-island-todo-duration` 不再读取）。首次到时前保存通知标记，重启不重复响；旧待办和进行中 ID 的格式不变 | `features/todos/storage.ts`；计算在 `timer.ts`，生命周期在 `useTodoTimer.ts` |
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
| 剪贴板历史（条目、收藏、备注与剪贴板设置）；图片原图和 128px 缩略图 | 应用数据目录（`clipboard-history.json`；图片在 `clipboard-images/`） | `clipboard_history/store.rs` |
| 剪贴板独立窗口上次关闭时的位置 | 应用数据目录（`clipboard-window.json`） | `clipboard_window/bounds.rs` |
| 通知、微信消息摘要、邮件正文 | 仅保存在内存中 | 各服务模块 |
| 微信摘要和最小化时隐藏任务栏图标的偏好 | WebView2 的 `localStorage`，见 [对外契约](contracts.md) | `features/messages/wechat/storage.ts` |
| 微信辅助功能恢复记录 | 应用数据目录（`wechat-accessibility.json`），记录进程 ID 和启动时间 | `wechat_reminders/accessibility.rs` |

总览见 [overview.md](overview.md)。

DSH（issue #51）：`agent_status/dsh_sessions.rs` 只读 `%APPDATA%/dsh-desktop/harness` 的 `storages/session_projcache/sessions/*.json`、对应 `sessions/*/session-*/session.v{3,4}.jsonl.zstd` 的存在性，以及 `profiles/web/desktop-storage.json` 的当前会话。同时读取共享 ~/.dsh、anywhere Beta ~/.dsh-beta 及社区端保存的绝对目录选择，按会话 ID 去重；不再要求 Desktop profile；DataElement harness 是社区独立根。`dsh_credentials.rs` 只在请求内存中读取该根目录的 `.credentials.yaml`；`dsh_usage.rs` 向固定官方 HTTPS 接口读余额，结果缓存 5 分钟，只在内存保存。不增加持久化余额或会话副本，设置只增加原有 key 下的 `agentShowDsh`。完整来源与限制见 [DSH 接入说明](../deepseek-harness.md)。

## 播放器兼容性提示

`focusd-island-media-diagnostics-dismissed` 保存在前端 localStorage，由 `src/features/media/storage.ts` 安全读写。格式是字符串数组，每项为小写播放器 `sourceAppId`、分隔符 `\u001f` 和状态（`noTimeline` / `needsUpdate` / `smtcOff` / `neteaseNeedsPlugin`）。只关闭同一播放器的同一问题，其他问题仍提示；非法 JSON、旧格式、非字符串或未知状态会忽略。播放器诊断结果、进程路径和版本不持久化；歌词校准只修改当前歌曲的内存秒表，切歌后重置。
# 网易云精准进度插件

应用数据目录下的 `media-plugins.json` 保存版本 1 的安装记录（文件路径、SHA256、Unix 秒安装时间）。`media-plugins/download/` 缓存固定版本的 BetterNCM 与 InfLink-rs，下载临时文件以 `.download` 结尾，失败时清理；缓存复用前重新校验大小和 SHA256。

用户点击安装后才写入网易云目录的 `msimg32.dll` 和 `BETTERNCM_PROFILE`（默认 `C:\betterncm`）下的 `plugins/InfLink-rs.plugin`。卸载保留加载器生成的其他数据；只删除记录中且哈希未变化的文件。组件从 GitHub 运行时下载，不随安装包分发。

