# 数据存放位置

## 更名迁移

新安装使用 `%APPDATA%/com.flyisland.app` 与 `%LOCALAPPDATA%/com.flyisland.app`。启动时在创建 Tauri 窗口前，`legacy_migration` 对迁移前目录及可选 `.custom` 目录执行幂等的同卷改名（文件被刚退出的旧版本 WebView 占用时退避重试约 6 秒），仍失败则递归复制，复制完整后删除旧目录；不覆盖已存在的新目录。改名和复制都失败时弹窗说明并**直接退出**，不让 Tauri 建出空的新目录（否则旧数据再也不会被迁移），下一次启动重试。WebView localStorage 由前端入口第一个 import（`src/shared/storage/runLegacyMigration.ts`）同步把旧前缀键复制到 `fly-island-`，保证任何模块读取存储之前完成，新键优先，成功后删除旧键。凭据、自启值和回复标记文件也由同一迁移模块一次性转存并清理。Codex / Claude Code 配置里迁移前写入的 Hook 指向已搬走的脚本，setup 阶段 `agent_status/hook_migration.rs` 检测到旧签名时，对相应的那一家用设置页同一套安装函数重写一次（只替换岛屿自己的条目）。

## 配置迁移 / Configuration transfer（2026-11-19）

`features/config-transfer/storage.ts` 仅为配置迁移枚举应用 localStorage；Rust `config_transfer/` 收集明确允许的文件数据。备份包含待办 / 归档 / 笔记、外观与所有预设、语言、快捷键、功能开关等前缀键；另包含剪贴板设置、文件中转路径列表、日志开关、网易云自动安装退出偏好、Agent hooks / 回复标记开关、远程主机 JSON（当前基线只有文档记录、无活跃模块）、插件 id / 版本 / 启用状态 / 非秘密设置、导入的音效包。插件自己的登录 / 数据库不作通用目录备份；目前宿主唯一插件设置存储为 plugins-state.json，没有通用插件 KV 数据目录。

历史与图片仅在勾选后包含；剪贴板位置指针保留本机，图片在恢复时重写为本机目录下的路径。文件中转只迁移引用，不复制对应文件。网易云安装文件和安装目录不迁移，在新机器重新探测。窗口坐标、设置窗口大小、剪贴板窗口位置 / 自选存储目录、agent-approval.json 令牌、agent-status.json / 会话 / running 标记、日志正文、歌词缓存、WorkBuddy 浏览器登录配置、Windows 凭据及第三方 Agent 配置原文均排除。

应用数据目录新增：`config-transfer-pending.json` 为导入后等待重启的 v1 数据；`config-transfer-rollback.json` 为恢复过程的文件与自启撤销日志（启动时若残留，先回滚再重试）；`config-transfer-result.json` 为待用户关闭的完成 / 异常报告；`plugins-restore.json` 为缺少插件包时保留的版本、启用状态与非秘密设置。前两项恢复成功即删除；全部都不进入下一份备份。没有新的 localStorage key。

English: backups cover app storage and explicitly selected user-data files, imported sound packs, integration switches, and plugin preferences. Clipboard history is opt-in. Device paths/coordinates, credentials, tokens, login profiles, caches and runtime snapshots are excluded. The pending backup and undo journal live in app data only during restore; results remain until dismissed. Missing plugin preferences remain in plugins-restore.json until their recorded version is installed or uninstalled. See [config-transfer.md](../config-transfer.md).

| 数据 | 位置 | 负责方 |
|---|---|---|
| 待办行为设置 | 现有 `fly-island-settings`：`todoTimerEnabled` 默认 false；`enableTodoReorder` 默认 true，`todoReorderVersion: 1` 表示已迁移；无标记的旧数据开启拖拽，有标记才读取保存的布尔值。关闭番茄钟清除本轮计时，保留进行中 ID | `features/appearance/settingsDefaults.ts`、`normalizeBehaviorSettings.ts`；沿用跨窗口 storage 同步 |
| 设置、预设、各功能开关、语言 | WebView2 的 `localStorage` | 前端各 feature 的 `storage.ts` |
| 音乐全局快捷键 | 同一 localStorage：`fly-island-music-shortcuts` 保存 `{ playPause, previous, next }`，默认均为空；主窗口启动和修改后同步到 Rust，注册结果仅在原生内存保存 | `features/media/storage.ts`、`useMusicShortcuts.ts`；原生 `media_control/hotkeys.rs` |
| 托盘图标可见性 | 同一 localStorage：`fly-island-tray-visible`，默认显示；主窗口启动时同步到 Rust，托盘菜单隐藏时由事件回写 | `windows/settings/storage.ts`、`windows/island/useTrayIntegration.ts`；原生 `tray.rs` |
| 岛屿字体、字号、刘海基准尺寸、额度环筛选 | `fly-island-settings`。字体模式为 `fontFamily`，本机字体名称为 `localFontFamily`。其他字段见 [对外契约](contracts.md) | `features/appearance/` |
| WorkBuddy 官网登录与余额 | `%LOCALAPPDATA%/com.flyisland.app/workbuddy-web/WebView2` 保存独立浏览器配置。同级 `connected` 文件记录已成功连接。积分汇总缓存在内存，有效结果缓存 5 分钟。额度读取成功后，把独立配置里的 WorkBuddy 域 Cookie 备份到 Windows 凭据管理器（`com.flyisland.app.workbuddy-web`），保留过期时间和 Cookie 属性。`cookies-active` 指向 `cookies-0`…`cookies-7` 或 `cookies-alt-0`…`cookies-alt-7` 的完整一组，旧版没有索引时读取 `cookies-0`…`cookies-7`。启动时补回缺失的可用 Cookie。断开时清除浏览数据、凭据管理器副本和连接标记 | `agent_status/workbuddy_connection.rs`、`agent_status/workbuddy_cookie_vault.rs`、`agent_status/workbuddy_usage.rs` |
| Z Code Coding Plan API Key 与平台 | Windows 凭据管理器（service `com.flyisland.app.zcode-coding-plan`，account `usage`）保存 `{ platform, apiKey }`；平台为 `bigmodel` / `zai`，清除时将 Key 设为 null 并保留平台。Key 不进入 localStorage 或明文文件。API Key 优先查询，未配置时回退到 Z Code 桌面版登录；额度缓存仅在内存保存 5 分钟，设置变化后清除并立即重新查询 | `agent_status/zcode_api_key.rs`、`agent_status/zcode_usage.rs` |
| 贴边收起样式 | 原有 `fly-island-settings` 对象的 `tuckStyle` 字段：`edge` / `line` / `hidden`，缺失或非法值按 `edge`；沿用跨窗口 storage 同步，不新增文件或 key | `features/appearance/storage.ts`、`settingsDefaults.ts`、`normalizeBehaviorSettings.ts`；通过 `windows/island/useIslandWindow.ts` 同步至原生内存状态 |
| 三色刷新和上一版颜色 | 同一 `localStorage`：`fly-island-color-refresh-v1` 为 `"1"` 时不再刷新；`fly-island-color-backup` 保存 `{ islandBackgroundColor, taskTextColor, pulseColor }`（大写 `#RRGGBB`），批量改色先备份，回退交换当前 / 备份；新用户或三色已匹配新默认值时只写标记、不新建备份，损坏备份视为空 | `features/appearance/storage.ts`；迁移流程 `colorRefresh.ts`、格式校验 `colorPalette.ts` |
| 会话排序默认值迁移（已撤） | 2026-11-19 起不再读写 `fly-island-session-sort-recent-v1`：已存的 `agentSessionSort` 原样保留，不再把 `"status"` 改成 `"recent"` | `features/appearance/storage.ts` |
| 颜色预设 | 同一 `localStorage`，沿用 `fly-island-color-presets`：数组项 `{ id, islandBackgroundColor, taskTextColor, pulseColor, pageTextColor? }`。2026-11-19 起新项保存四色，展开文字为大写 `#RRGGBB` 或 `""`（跟随背景）；旧项缺字段时不覆盖当前展开文字。四色组合去重、最多 8 项，应用前仍写原三色备份；删除确认只在组件内存中保持约 3 秒，不持久化 | `features/appearance/storage.ts`、`colorPresets.ts`、`ColorPresetRow.tsx` |
| 自动更新开关 | 同一 `localStorage`：`fly-island-auto-update`，只有 `"false"` 表示关闭，缺失算开启。由打开「关于」的窗口写入；独立设置窗口再通过 `fly-island-update-request` 告诉主窗口，主窗口负责定时检查和安装 | `features/updater/storage.ts`、`updaterController.ts` |
| 交流群红点 | 同一 `localStorage`：`fly-island-community-invite-seen`，点开「关于」里的用户交流群后写 `"true"`，各窗口靠 storage 事件同步。群二维码不存本地，每次点开从官网 `island.flyliu.org/community/wechat-group.jpg` 加载（微信每周换码，换官网上的图即可） | `features/updater/storage.ts`、`useCommunityInvite.ts` |
| 锁定小岛位置、独立设置窗口 | 同一 WebView2 `localStorage`：`fly-island-settings.positionLocked`（默认 false）、`fly-island-detached-settings`（缺失时默认 `"true"`，保留已保存的选择） | `features/appearance/storage.ts`、`windows/settings/storage.ts` |
| 待办、以后的待办、每日笔记、归档、正在进行的待办、待办日期 | WebView2 的 `localStorage`（`fly-island-todos` 等 key，见 [contracts.md](contracts.md)） | `features/todos/storage.ts` |
| 待办倒计时与各项时长 | 同一 `localStorage`：`fly-island-active-todos` 保存全部活动 ID，`fly-island-todo-timers` 保存各项 `{ todoId, endsAt, durationMinutes, notified }`；以结束时间恢复剩余秒数。新键缺失时兼容旧单任务键，并继续把主任务同步到原格式的 `fly-island-active-todo`、`fly-island-todo-timer`。`fly-island-todo-durations` 按待办 id 保存 1–240 的整数分钟（没有记录按 15 分钟；旧共用时长键不再读取）。首次到时前保存通知标记，重启不重复响；详情见 [contracts.md](contracts.md) | `features/todos/storage.ts`；计算在 `timer.ts`，生命周期在 `useTodoTimer.ts` |
| AI 代理状态与运行标记、hook 脚本 | 应用数据目录（`agent-status.json`、`agent-*-running*.flag`、`fly-island-agent-*.{cmd,ps1}`；`agent-sessions/<会话 ID>.json` 是 SessionStart / SessionEnd 钩子（`fly-island-agent-session.ps1`）记下的会话进程、启动时间、终端和结束原因，优先于 Claude Code 未公开的 `~/.claude/sessions`；`agent-codex-notification.json` 是 Codex PermissionRequest 钩子的输入，用于判断 Codex 会话是否在等待确认；`agent-sessions-seen.json` 记下见过的会话的进程、启动时间、所在程序和 Orca 终端，保留两天，用于 `/clear`、结束后的会话找回窗口；`agent-focus.log` 是点击会话切换窗口的排查日志（只有步骤和程序名）；`agent-terminals/<Orca 终端 handle>.json` 为 Claude Code SessionStart hook 的输入，只在 Orca 终端里写，用来从会话切到它的 Orca 标签；`agent-claudeCode-notification.json` 为 Claude Code 最近一次"等待授权 / 等待输入"通知的 hook 输入，只用于判断会话是否在等你，清除状态时删除；旧版保存的 `agent-*-hook-input.json` 在安装/修复时删除；`agent-remote-hosts.json` 是设置 → AI Agent → 远程电脑里打开的主机，以及在那一页添加的主机（`custom`：名称、用户名、地址、端口；岛屿不改 `~/.ssh/config`）；`remote-sessions/<Host>/` 是从这些机器读来的会话文件节选，按家目录结构存放、保留远端修改时间，离开会话时间窗口的文件在下次读取时删除） | `agent_status`（会话列表在 `sessions.rs`、`session_scan.rs`，等待判断在 `notifications.rs`，远程机器在 `remote_hosts.rs`、`remote_fetch.rs`、`remote_sessions.rs`，标题与提问文字处理在 `title.rs`） |
| 问题排查日志与诊断包 | 应用数据目录：`app-log.json`（`{ "enabled": bool }`，仍默认关闭）；`logs/fly-island.log` 与 `logs/fly-island.1.log`（每份最多约 5 MiB）。运行中内存保留最近 2,000 条诊断事件，并单独保留启动摘要；关闭文件日志时不新增磁盘记录。开启后写入尚未落盘的缓冲；「清空」清除日志文件和最近事件，保留本次启动摘要。导出的 `fly-island-diagnostics-YYYY-MM-DD.zip` 只保存到用户选定的位置，内含已有日志、内存最近事件、启动摘要、插件日志的脱敏摘要及白名单设置快照，不自动上传。 | `app_log`，前端 `features/diagnostics` |
| 文件中转列表（只存路径，不复制文件） | 应用数据目录（`file-shelf.json`） | `file_shelf` |
| 设置窗口上次关闭时的大小与位置（位置已不在任何屏幕上时忽略） | 应用数据目录（`settings-window.json`） | `settings_window/bounds.rs` |
| 审批端点端口与访问令牌（装进 Claude Code / Codex 的 PermissionRequest 钩子）；首选端口 47830，被占用时换端口并写回 | 应用数据目录（`agent-approval.json`） | `agent_approval` |
| 回复状态标记（B9，默认关）：Claude Code 全局指令末尾的一段说明，起止为 `<!-- fly-island: reply marker v1 -->` 与 `<!-- /fly-island: reply marker -->`，只增删这一段；会话列表读回复最后一行的 `↩` / `⋯` / `✓`，作为 `AgentSessionSummary.replyMarker`（`yourTurn` / `background` / `done`），并从显示的回复里去掉这一行 | `%CLAUDE_CONFIG_DIR%` 或 `~/.claude/CLAUDE.md`；Tauri 命令 `get_reply_marker_state`、`set_reply_marker` | `agent_status/reply_marker.rs` |
| magpie 网关的用量（B10）：Claude Code 的 `ANTHROPIC_BASE_URL` 指向本机（`localhost` / 回环地址）时，带着 `ANTHROPIC_AUTH_TOKEN`（或 `ANTHROPIC_API_KEY`）请求 `GET <base>/v1/magpie/quotas`，每分钟至多一次，非 404 失败下一分钟再试，404 视为不是 magpie、10 分钟后再试；不走代理、不跟随重定向，令牌只发往这个本机地址；有数据时优先于 claude-hud 快照，`get_agent_usage` 的 `source` 为 `magpie` | 只读 `~/.claude/settings.json`（或 `CLAUDE_CONFIG_DIR`）的 `env`，没有时读进程环境变量；结果只在内存中 | `agent_status/magpie.rs` |
| Claude 桌面版的用量：Claude 桌面版每次向 Anthropic 取用量（打开时约每 15 分钟）都会往自己的数据目录追加一条样本（`t` 毫秒时间、`org`、`u.fh` 5 小时已用 %、`u.sd` 7 天已用 %，以及 `so` / `sn` 等按模型的周窗口；version 1 把 `fh` / `sd` 直接放在样本里）。取所有安装里最新的一条；样本没有重置时间，所以比窗口长度还旧的窗口不显示（5 小时的超过 5 小时、7 天的超过 7 天）。没有 magpie 时，和 claude-hud 快照比谁更新就用谁，`source` 为 `claudeDesktop`；不联网、不读登录 | 只读 `plan-usage-history.json`：`%APPDATA%\Claude\`、商店版的 `%LOCALAPPDATA%\Claude-Data\<包>\` 或 `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`（也看其下 `appdata\`），至多读 4 MiB | `agent_status/claude_desktop_usage.rs` |
| Codex 用量（B4）：Agent 页的 Codex 额度环。读 Codex 自己写的会话记录里最新一个带额度的 `token_count` 事件（`rate_limits` 的 `primary` / `secondary`，按 `window_minutes` 分：一天以内为 5 小时、八天以内为 7 天，更长的（免费账号的 30 天窗口 43200）按天数单列为 "30d"；窗口为 null 的跳过；`limit_id` 不是 `codex` 的事件（其他额度桶）跳过；取各文件里事件时间最新的一条，不按文件修改时间——换账号后旧会话文件可能更晚被改动，但里面是旧账号的额度），每 30 秒读一次；不联网、不读 Codex 登录；Tauri 命令 `get_codex_usage`，返回和 `get_agent_usage` 相同的结构，`source` 为 `codex` | 只读 `%CODEX_HOME%` 或 `~/.codex/sessions/<年>/<月>/<日>/rollout-*.jsonl`（含长对话的分页 `-<thread>_<页>.jsonl`；最近 7 天、最新 20 个文件，各读末尾 256 KiB），以及 `archived_sessions/rollout-*.jsonl`（压缩的 `.jsonl.zst` 不读） | `agent_status/codex_usage.rs` |
| Codex / Claude Code hook 配置 | `~/.codex/config.toml`、`~/.claude/settings.json` 中带标记的受管区块 | `agent_status` |
| QQ 邮箱授权码、翻译 API 密钥 | Windows 凭据管理器（`com.flyisland.app.qq-mail`、`com.flyisland.app.translation`；翻译密钥按服务分条目，用户名为服务 id，DeepSeek 沿用 `deepseek`） | `qq_mail`、`translation` |
| 待办 Markdown 导出 | 用户选择的目录（经过校验） | `system` |
| 每日 Markdown 反向同步偏好 | 同一 WebView2 `localStorage`：`fly-island-todo-file-sync`，仅字符串 `"true"` 开启，默认关闭 | `features/todos/storage.ts`、`useTodoFileSyncSetting.ts` |
| 反向同步共同基线、文件版本、待稳定采样、串行保存队列 | 仅在主窗口内存，每日期和目录一个协调器；重启用既有 `fly-island-last-saved-signature` 重建共同内容，不增加待办副本 key。每 1.5 秒读取一次，稳定变化才修改列表和笔记；导入继续写既有待办/笔记/归档 key。跨天归档前先处理文件，临时不稳定/编辑中延后，损坏文件保留后将本地数据归档并进入新一天 | `features/todos/todoMarkdownSync.ts`、`useTodoFileSync.ts`、`useTodoSaving.ts`、`useTodoRollover.ts` |
| 同步冲突恢复副本 | 用户保存目录：`YYYY-MM-DD.conflict-<Unix 纳秒>-island.md` 与 `-file.md`，分别保留冲突前的岛屿与文件内容；只在有冲突时创建，不自动清理。写失败时尽力保存 `-write-error.md` 原文件副本 | `system/todo_sync.rs`；读取/写入 IPC 类型收口在 `features/todos/api.ts` |
| 开机自启 | `HKCU\...\Run` 下的值 `Fly Island` | `system` |
| 剪贴板历史（条目、收藏、备注与剪贴板设置）；图片原图和 128px 缩略图 | 应用数据目录（`clipboard-history.json`；图片在 `clipboard-images/`），可在设置里移到自选文件夹，位置记在应用数据目录的 `clipboard-location.json` | `clipboard_history/store.rs`、`clipboard_history/location.rs` |
| 剪贴板独立窗口上次关闭时的位置 | 应用数据目录（`clipboard-window.json`） | `clipboard_window/bounds.rs` |
| 剪贴板悬停预览 | WebView2 的 `localStorage`，在 `fly-island-settings.clipboardHoverPreview` 保存。默认关闭，岛内和独立窗口共用 | `features/appearance/storage.ts` |
| 通知、微信消息摘要、邮件正文 | 仅保存在内存中 | 各服务模块 |
| 微信摘要和最小化时隐藏任务栏图标的偏好 | WebView2 的 `localStorage`，见 [对外契约](contracts.md) | `features/messages/wechat/storage.ts` |
| 微信辅助功能恢复记录 | 应用数据目录（`wechat-accessibility.json`），记录进程 ID 和启动时间 | `wechat_reminders/accessibility.rs` |
| Telegram 通知预览 | 运行时内存。仅在用户点击时按需查询 Windows 通知数据库中的对应条目；激活 TG 成功后按通知 ID 删除原生通知 | `telegram_notifications/` |

总览见 [overview.md](overview.md)。

歌词缓存仍在应用数据目录 `lyrics-cache/*.json`，增加可缺省的 `schemaVersion`。旧缓存可作为在线升级查询失败的后备，新的行级缓存与未找到结果一周后重试逐字来源；新键附加原始歌名、播放器 AUMID 和歌曲 ID，防止不同版本混用。酷狗客户端 INI / KRC、汽水 `SodaMusic/LunaCacheV2/entries.db` 只读，不创建数据库锁或写入第三方文件；限制见 [歌词源说明](../lyrics-sources.md)。

DSH（issue #51）：`agent_status/dsh_sessions.rs` 只读 `%APPDATA%/dsh-desktop/harness` 的 `storages/session_projcache/sessions/*.json`、对应 `sessions/*/session-*/session.v{3,4}.jsonl.zstd` 的存在性，以及 `profiles/web/desktop-storage.json` 的当前会话。同时读取共享 ~/.dsh、anywhere Beta ~/.dsh-beta 及社区端保存的绝对目录选择，按会话 ID 去重；不再要求 Desktop profile；DataElement harness 是社区独立根。`dsh_credentials.rs` 只在请求内存中读取该根目录的 `.credentials.yaml`；`dsh_usage.rs` 向固定官方 HTTPS 接口读余额，结果缓存 5 分钟，只在内存保存。不增加持久化余额或会话副本，设置只增加原有 key 下的 `agentShowDsh`。完整来源与限制见 [DSH 接入说明](../deepseek-harness.md)。

## 播放器兼容性提示

`fly-island-media-diagnostics-dismissed` 保存在前端 localStorage，由 `src/features/media/storage.ts` 安全读写。格式是字符串数组，每项为小写播放器 `sourceAppId`、分隔符 `\u001f` 和状态（`noTimeline` / `needsUpdate` / `smtcOff` / `neteaseNeedsPlugin`）。只关闭同一播放器的同一问题，其他问题仍提示；非法 JSON、旧格式、非字符串或未知状态会忽略。播放器诊断结果、进程路径和版本不持久化；歌词校准只修改当前歌曲的内存秒表，切歌后重置。
# 网易云精准进度插件

应用数据目录下的 `media-plugins.json` 保存版本 1 的安装记录（文件路径、SHA256、Unix 秒安装时间）。`media-plugins/download/` 缓存固定版本的 BetterNCM 与 InfLink-rs，下载临时文件以 `.download` 结尾，失败时清理；缓存复用前重新校验大小和 SHA256。`media-plugins/manual/msimg32.dll` 是安全软件拦截时“手动放入”准备的加载器副本（校验过的固定版本），供用户在资源管理器里拖进网易云目录。`media-plugins-auto.json` 记录自动安装：`opted_out`（用户卸载过就不再自动装）和自动尝试过的 `<安装目录>|<版本>`。

用户点击安装后才写入网易云目录的 `msimg32.dll` 和 `BETTERNCM_PROFILE`（默认 `C:\betterncm`）下的 `plugins/InfLink-rs.plugin`。卸载保留加载器生成的其他数据；只删除记录中且哈希未变化的文件。组件从 GitHub 运行时下载，不随安装包分发。


## 内置插件市场

WebView2 localStorage 的 `fly-island-native-plugins` 记录安装的内置插件 id，`fly-island-native-plugins-disabled` 记录已安装但手动关闭的 id。旧配置缺少关闭清单时，已安装的插件均启用。关闭仅暂停功能，保留插件的设置；卸载清除对应的关闭标记，重装时默认启用。

喝水提醒的间隔与自定义文案保存在 `fly-island-water-reminder`，关闭和卸载时保留偏好。计时进度和文案轮换位置保存在主窗口内存中。

## 插件 API v1

原生应用数据目录下 `plugins-state.json` 保存安装清单、启用状态、非秘密插件 settings、开发模式与索引 URL；临时原子写文件 `plugins-state.json.tmp`。这是需要在前端启动前恢复进程的安装注册表，不扩展或迁移现有 fly-island-settings。秘密存 Windows 凭据管理器 service `com.flyisland.app.plugins`，account `<id>/<setting-key>`，只经 stdin 发给对应插件，不返回前端。

`plugins/<id>/` 存经索引校验的包；`.staging-<id>` / `.backup-<id>` 只用于安装事务。`plugin-logs/<id>.log` 保存有限 stderr。额度、会话和通知仅在内存，停用清空，不落盘。开发目录路径记录在注册表，卸载不会删除开发目录。

豆包独立登录取得的 Cookie 也写入凭据管理器 `doubao/cookie`。旧插件自己的 `%APPDATA%/com.flyisland.app/plugins/doubao/cookie.txt` 仅在凭据保存成功后迁移并删除；不读取或修改用户日常浏览器 profile。

仓库内 `artifacts/plugins/` 为忽略的 zip 与 plugins-index.json 构建产物；本地测试数据在 node_modules/.cache/plugin-tests/。插件 crate 的 target 不入库。

索引下载/解析诊断写入同样约 1 MiB 上限的 `plugin-logs/catalog.log`；不记录 URL 认证信息。索引失败统一返回 `plugin_index_unavailable`，设置页按当前语言显示简短状态和重试，不回显底层错误。

## 时间与天气（2026-11-19）

前端 `features/weather/storage.ts` 通过安全读写保存 WebView2 localStorage：`fly-island-clock-weather` 存两个显示开关和用户选择的城市名/经纬度，`fly-island-weather-cache` 存一条城市坐标、摄氏温度、WMO code、观测时间与获取时间（Unix 毫秒）。安装记录沿用 `fly-island-native-plugins` 的 `clockWeather` id；卸载保留城市、显示偏好和缓存；重装只打开两个显示开关。开关与城市更新各自从最新记录合并，搜索本身不写入城市。缓存超过三小时不显示。

Rust `weather/` 只按显式城市搜索或已保存坐标请求 Open-Meteo；城市搜索结果质量不足时会向 `nominatim.openstreetmap.org` 补充一项。用户点击定位时才同时请求 Windows Geolocator 和 `ipwho.is` 的网络大致位置；Windows 坐标用 Nominatim 反向解析城市。坐标只发给这些地理编码/天气服务，不写应用数据文件、凭据或独立位置记录，也不在后台自动定位。前端订阅在关闭天气、关闭插件或卸载后停止刷新；同窗口共享请求和缓存。说明见 [时间与天气](../plugins/clock-weather.md)。
护眼插件 `eye-care` 的非秘密配置复用 `plugins-state.json` 中对应插件的 settings（`period`、`rest-minutes`、`idle`、`allow-skip`、`pause-fullscreen`、`language`）。周期、剩余时间和本轮推迟标记仅在插件内存；重启 / 保存设置后从完整用眼周期开始。不保存输入记录，不新增文件或 localStorage key。

护眼宿主休息窗口的显示器列表、首帧状态、重试和会话令牌只在内存；不新增持久化文件或 localStorage key。`_host-eye-care-windows` 是初始化时临时注入的能力标记，不持久化。


## 日历标记、MiniMax Code 与设备电量

日历标记沿用内置插件的安装/停用记录。设备的音频绑定写入 WebView localStorage 的 fly-island-device-battery，设备读数及低电量状态仅在内存。MiniMax 可选密钥走宿主凭据管理器，额度和会话只读 MiniMax 本机数据。审批接入由用户在插件设置中显式启用，仅修改 ~/.minimax/hooks.json 内本插件登记的处理器，临时审批保存在 %LOCALAPPDATA%/fly-island-minimax/approvals.json。
