# 对外契约清单

## 配置备份 / Configuration backup（2026-11-19，issue #87）

备份文件默认名 `fly-island-config-YYYY-MM-DD.json`，UTF-8 JSON：`{ app: "fly-island", formatVersion: 1, exportedAt: "<ISO 8601>", appVersion: "<版本>", localStorage: { "<key>": "<原始字符串>" }, files: { launchAtStartup, agents, plugins, clipboard, data, assets } }`。不同 app、未知版本、缺字段 / 错类型或未知文件均拒绝，不将旧外观主题当备份。总文件上限 256 MiB。

`localStorage` 按 `fly-island-` 前缀枚举（当前所有契约键，包括语言，都在此命名空间），不逐项写死。设备白名单 `fly-island-position` 不导出、不覆盖、不清除；运行态 `fly-island-settings-focus`、`fly-island-position-reset`、`fly-island-panel-preview` 同样排除。恢复清除未出现在备份里的其他本应用键，原样写入字符串；其他来源键不动。无新增 localStorage key。

`files.agents` 为 `{ codex, claudeCode, replyMarker }` 布尔集；`plugins` 为 `{ developerMode, indexUrl, installed: [{ id, version, enabled, settings }] }`（settings 仅 manifest 声明的非秘密值，不携带 manifest / 可执行包 / 目录）。缺包或版本不同写 `plugins-restore.json`，提示重装；以后装入相同版本时恢复非秘密设置与启用状态，卸载删除待恢复记录。`clipboard` 为 `{ settings, history: null | { items, images: { "<受限 PNG 文件名>": "<base64>" } } }`；图片路径在备份里改成文件名，恢复时定位到本机原有剪贴板目录；history=null 保留本机历史。`data` 仅允许 `file-shelf.json`、`agent-remote-hosts.json`、`app-log.json`、`media-plugins-auto.json` 的 JSON 对象；后者只保留 optedOut，attempted 为空。`assets` 为受限 `sound-packs/<id>/pack.json` 与其声明音频的 base64 映射。凭据、登录 Cookie、令牌和运行快照不在格式中。

命令（前端类型化封装 `features/config-transfer/api.ts`）：`export_config({ localStorage, includeClipboardHistory, exportedAt, title })` 返回是否保存；`read_config_import({ title })` 返回已校验备份或取消的 null；`stage_config_import({ backup })` 暂存校验后的数据；`restart_after_config_import()` 重启；`config_transfer_startup()` 返回 `{ ready, localStorage }`（只有 main 收到待恢复键）；`finish_config_import({ success })` 完成或回滚；`get_config_import_report()` / `dismiss_config_import_report()` 读取 / 关闭迁移报告。文件对话框在独立 STA 线程使用调用窗口为父窗口。

English: v1 backups use the envelope above and raw app-owned storage strings. Device coordinates and transient requests are excluded; missing app keys are removed on restore. Clipboard preferences always transfer, history/images require explicit opt-in. Secrets, login profiles, executables, caches and runtime state never transfer. Native files are restored before services start, storage before React mounts; all windows wait for completion. Missing plugin packages require reinstalling the recorded version. New versions must preserve this contract or provide explicit migration.

文件夹选择（2026-11-18）：新增命令 `pick_folder({ initialDirectory?, title? })`，两个参数都可缺省。以调用窗口为父窗口打开 Windows 原生文件夹选择框，返回所选目录字符串，取消返回 `null`，失败返回错误。命令本身不写任何设置；待办保存路径在选中后沿用原 `fly-island-save-directory` 键与格式保存。

Codex 会话摘要（2026-11-15）：`list_agent_sessions` 可选返回 `lastCompletedAt`（最近显式 `task_complete` 的 Unix 毫秒时间；未知时省略）。前端兼容字段缺失，原有字段、命令名、参数、事件及持久化格式不变。用于识别两次轮询之间完成的一轮，首次看到的完成仅在 15 秒内提醒；不以文件修改时间代替完成时间。

歌词接口兼容扩展（2026-11-15）：`get_lyrics` 的 `query.sourceAppId` 为可缺省字符串，`query.wordFill` 为可缺省布尔值（默认 false）；旧前端不传仍可查询在线歌词。开启逐字填充时优先查找逐字结果，保留第一个行级结果兜底。返回 `source` 新增 `qqmusic` / `soda`，`lrc` 仍为增强 LRC 字符串。缓存可缺省的 `schemaVersion` 新值为 3，旧字段保持可读，详见 [歌词源说明](../lyrics-sources.md)。

纯重构中下列标识不得改变，规则见根目录 [AGENTS.md](../../AGENTS.md#对外契约不得随意变更)。本次产品更名已将应用标识、存储前缀、Hook 文件名、凭据服务名、日志文件名和自启值切换到下表的新名字；迁移前数据只由 `src-tauri/src/legacy_migration/` 与 `src/shared/storage/legacyMigration.ts` 一次性兼容读取，成功后清理旧值。新增契约时同步更新本节。

## localStorage key

新用户默认偏好（2026-11-27）：新增 `fly-island-first-launch-defaults-v1`，字符串 `pending` / `complete`。仅全无应用键的新配置写入；主窗口领取原生初始化时写 `complete`，以后不再套用。该运行标记不导出、不恢复。已有用户的任意应用键、缺失字段回退和已保存值均保留，不作默认值迁移。详见 [数据存放位置](data-storage.md#新用户默认偏好2026-11-27)。

音乐全局快捷键（2026-11-19）：新增 `fly-island-music-shortcuts`，JSON 对象 `{ playPause: string, previous: string, next: string }`，三项缺失、非法或空值按空字符串读取（不注册），不进外观预设。主窗口启动及跨窗口修改后调用 `set_media_shortcuts({ enabled, shortcuts, target? })`，可选 target 与音乐面板当前会话一致；音乐关闭时释放全部，保存的键保留。`get_media_shortcut_errors()` 返回各动作最近的错误字符串对象（成功项省略），`media-shortcut-status` 广播同一对象。复用现有组合键格式与 Windows 注册冲突判定，另预留审批键 `Ctrl+Alt+Y` / `N` / `T`；设置页互查音乐、翻译和剪贴板快捷键。热键只控制已有 SMTC 会话，没有会话时静默跳过。

时间与天气（2026-11-19）：`fly-island-settings.collapsedLayout` 的 slot 新增 `clock` / `weather`，完整默认顺序为 `text,mail,shelf,music,agents,clock,weather`。读取旧数组时保留原有合法顺序，将缺少的位追加到末尾；未知和重复项丢弃。插件未安装时隐藏这两个位，重排其余位不丢失隐藏位置。

岛上的排列（2026-11-19 第二版）：`collapsedLayout` 再增 slot `pulse`（状态灯，原先是文字的一部分），默认顺序 `pulse,text,mail,shelf,music,agents,clock,weather`；读取没有 `pulse` 的旧数组时把它插在 `text` 前面（与旧版显示位置相同），有就保留原位置。新增 `collapsedHidden`（slot 数组，默认 `[]`）：拖进编辑器下方盒子、不在岛上显示的位；只认已知 slot，去重，`text` 不能隐藏。新增 `collapsedPadding`（整数 px，4–32，默认 18）：收起岛左右两侧的留白，属于外观字段，随外观预设保存。`collapsedHeight` 的下限从 32 改为 26（前端和 Rust `MIN_COLLAPSED_ISLAND_HEIGHT` 同步）。旧版本读到 `pulse` 会当未知项丢掉，显示不受影响。

`fly-island-settings.messagePreviewSeconds` 为岛上通知停留时长，3–30 的整数秒，默认 5；旧记录缺失或非法值回退到 5。

`fly-island-settings` 的待办轮换字段兼容旧记录：`rotateTodos` 默认 false、`showIdleTodoCount` 默认 true、`todoRotationSeconds` 默认 5（1–60）、`todoRotationMode` 默认 `switch`（`switch` / `scroll`）、`todoScrollSpeed` 默认 20（10–40 逻辑像素/秒）。`todoRotationCount` 已移除，旧记录中的该字段忽略且不再写回。轮换候选为全部已开始且未完成的普通待办，按列表顺序显示；缺失或非法设置由 normalize 回退。

`fly-island-settings` 的空闲文字字段（2026-11）：`idleText` 默认 `""`（去首尾空白、换行变空格、最多 40 个字符，非字符串视为空；空则沿用 `fly-island`），`todoPendingDisplay` 默认 `pendingCount`（`pendingCount` / `idleText`，其余值回退）。旧记录无这两个字段时行为不变：`showTitle` 仍控制 `fly-island` 标题，`showIdleTodoCount` 仍控制剩余数量；自定义 `idleText` 非空时，只在岛上没有别的内容时显示（不依赖 `showTitle`）；`todoPendingDisplay=idleText` 时，"有待办但没开始"一行显示空闲文字（空则 `fly-island`）而不是剩余数量。


待办并行状态保存到 `fly-island-active-todos`（去重的字符串 ID 数组，首项为主任务）和 `fly-island-todo-timers`（独立计时对象数组 `{ todoId, endsAt, durationMinutes, notified }[]`，每项 ID 唯一）。首次读取若新键缺失、JSON 损坏或根类型错误，则从旧 `fly-island-active-todo` 字符串和 `fly-island-todo-timer` 单对象兼容读取。新键中的空数组表示已停止。非法数组项忽略，通知标记缺失按 false。

旧 `fly-island-active-todo` 同步主任务 ID，旧 `fly-island-todo-timer` 同步主任务的计时对象。轮换开启时，新增活动任务按开始顺序追加，岛屿保持展开。轮换关闭时，保留主任务和其他有计时的任务。开始任务或再来一轮时，该任务成为主任务，岛屿收起。停止、完成或删除只清除对应任务的计时。关闭番茄钟清空全部计时，活动任务仍遵循轮换设置。每轮首次提示前写入 `notified: true`，同一次检查中多项到时一起标记、合响一次。跨天保留所有计时中或已到时待处理任务的 ID 与结束时间。

| key | 当前定义位置 |
|---|---|
| `fly-island-settings` | `features/appearance/storage.ts` |

| `fly-island-tuck-line-migration`（旧版写的 `"1"`：细线默认样式迁移完成。2026-11-19 起不再读写，迁移已撤掉：标记丢失时它会把用户重新选好的露边 / 隐藏又改回细线；已有的值留在原处不删） | 无（曾在 `features/appearance/storage.ts`） |
| `fly-island-collapsed-text-default-v1`（迁移标记） | `features/appearance/storage.ts` |
| `fly-island-color-refresh-v1`（`"1"`：2026-11-13 默认配色刷新完成；无存档或三色已等于新默认值时只写标记、不新建备份，其余旧存档覆盖三色，备份 → 设置 → 标记，重试保留已有备份） | `features/appearance/storage.ts`、`colorRefresh.ts` |
| `fly-island-session-sort-recent-v1`（旧版写的 `"1"`：会话排序 `status` → `recent` 的一次性迁移完成。2026-11-19 起不再读写，迁移已撤掉，理由同上；已有的值留在原处不删） | 无（曾在 `features/appearance/storage.ts`） |
| `fly-island-color-backup`（`{ islandBackgroundColor, taskTextColor, pulseColor }`，均为大写 `#RRGGBB`；迁移、恢复默认外观和批量改色前保存；回退时与当前三色互换，手动改一个颜色不写） | `features/appearance/storage.ts`、`colorPalette.ts` |
| `fly-island-color-presets`（`{ id, islandBackgroundColor, taskTextColor, pulseColor, pageTextColor? }[]`；id 为字符串，前三色为大写 `#RRGGBB`。2026-11-19 起新预设包含 `pageTextColor`：大写 `#RRGGBB` 或 `""`（跟随背景）；旧项缺失或此可选字段损坏时保留缺失，应用不改变当前展开文字。最多 8 项，包含展开文字 / 跟随背景状态去重，缺失与显式 `""` 不合并；损坏必需字段跳过，非法根数据视为空；不复用已退役的 `fly-island-setting-presets`） | `features/appearance/storage.ts`、`colorPresets.ts` |
| `fly-island-setting-presets`（2026-11-09 起不再读写：样式预设已去掉，旧数据留着不动） | — |
| `fly-island-todos` | `features/todos/storage.ts` |
| `fly-island-active-todo`（主任务 ID 字符串，兼容原单任务格式） | `features/todos/storage.ts` |
| `fly-island-active-todos`（全部活动 ID 数组，首项为主任务。无新数据时兼容读取旧单 ID） | `features/todos/storage.ts` |
| `fly-island-todo-timer`（主任务倒计时：`{ todoId, endsAt, durationMinutes, notified }`，`endsAt` 为 Unix 毫秒时间；保留原单对象格式） | `features/todos/storage.ts` |
| `fly-island-todo-timers`（各任务独立倒计时对象数组；无新数据时兼容读取旧单对象） | `features/todos/storage.ts` |
| `fly-island-todo-remind-minutes`（上次实际选择的提前提醒分钟数，0–60 的整数；缺失或非法按 5；0 表示不提醒） | `features/todos/storage.ts` |
| `fly-island-todo-durations`（各项待办的时长 `{ [todoId]: 1–240 的整数分钟 }`，没有记录或无效按 15 分钟，写入时去掉已删除待办；2026-11-12 起取代所有待办共用的 `fly-island-todo-duration`，旧 key 不再读取也不删除） | `features/todos/storage.ts` |
| `fly-island-todo-remind-minutes`（v3.2.6：上一次开始倒计时时选的“结束前提醒”分钟数，0–60 的整数，0 为不提醒；作为下一轮的默认值，缺失或无效按 5） | `features/todos/storage.ts` |
| `fly-island-current-date` | `features/todos/storage.ts` |
| `fly-island-archives` | `features/todos/storage.ts` |
| `fly-island-scheduled-todos`（安排在以后日期的待办，`{ id, title, date, createdAt }[]`） | `features/todos/storage.ts` |
| `fly-island-daily-note` | `features/todos/storage.ts` |
| `fly-island-save-directory` | `features/todos/storage.ts` |
| `fly-island-last-saved-signature` | `features/todos/storage.ts` |
| `fly-island-position` | `windows/island/storage.ts` |
| `fly-island-music-sources`（`{ id, label, archived? }[]`，按顺序；`archived: true` 表示已归档，不出现在顺序里、再次出现时不追加；旧数据无该字段即未归档。2026-11-14 起） | `features/media/storage.ts` |
| `fly-island-music-shortcuts`（`{ playPause, previous, next }`，均为空字符串或组合键） | `features/media/storage.ts` |
| `fly-island-tray-visible`（`"true"` / `"false"`；只有 `"false"` 隐藏托盘图标，缺失或其他值按显示） | `windows/settings/storage.ts` |
| `fly-island-last-page`（`todo` / `music` / `shelf` / `qq` / `agents` / `translation` 之一，岛上最后打开的页面；收起的岛点文字时回到它。`clipboard` 与 `settings` 不记录；缺失或非法回退 `todo`。2026-11-14 起） | `windows/island/lastPage.ts` |
| `fly-island-media-diagnostics-dismissed`（字符串数组，每项为小写 sourceAppId + `\u001f` + 非 ok 的 status；损坏或旧格式回退空数组） | `features/media/storage.ts` |
| `fly-island-settings-focus`（主窗口 → 设置窗口的跳转请求） | `windows/settings/storage.ts` |
| `fly-island-detached-settings`（`"true"` / `"false"`：设置在独立窗口打开；2026-11-10 起没有或无效时默认独立窗口，已保存的 `"false"` 仍为岛上内嵌，不进外观预设） | `windows/settings/storage.ts` |
| `fly-island-position-reset`（设置窗口 → 主窗口：让岛回到主屏顶部居中，`{ requestedAt }`，超过 5 秒的请求忽略） | `windows/settings/storage.ts` |
| `fly-island-panel-preview`（设置窗口 → 主窗口：调外观或贴边样式时让岛实时预览，`{ mode, requestedAt }`，`mode` 为 `expanded` / `collapsed` / `tucked`（`tucked` 为 3.1.0 新增，旧格式照常可读），超过 2 秒的请求忽略） | `windows/settings/storage.ts` |
| `fly-island-qq-mail-settings` | `features/messages/mail/storage.ts`（`{ accounts: [{ email, host, enabled }] }`，兼容读取旧的单账户 `{ email, enabled }`，解析在 `mailAccounts.ts`） |
| `fly-island-qq-mail-remote-images`（2026-11-11 起不再读写：邮件里的远程图片总是加载，已存的值留在原处不删） | 无 |
| `fly-island-qq-notifications-enabled` | `features/messages/qq-notifications/storage.ts` |
| `fly-island-qq-notification-access-requested` | `features/messages/qq-notifications/storage.ts` |
| `fly-island-telegram-notifications-enabled`（`boolean`：Telegram 插件的接收开关，缺省为关；只在插件已安装且启用时生效，主窗口据此启停原生监听，卸载不清除此偏好） | `features/messages/telegram/storage.ts` |
| `fly-island-wechat-reminders-enabled` | `features/messages/wechat/storage.ts` |
| `fly-island-office-im-enabled`（`{ dingtalk, feishu, wecom }`：已安装的钉钉 / 飞书 / 企业微信是否接收提醒，缺省为开） | `features/messages/office-im/storage.ts` |
| `fly-island-message-source-order`（`MessageSource[]`：消息页标签的顺序，长按拖动调整；未知来源丢弃，缺少的来源补在末尾） | `features/messages/sourceOrder.ts` |
| `fly-island-native-plugins`（`string[]`：插件市场里已安装的内置插件 id，按安装顺序；取值 `dingtalk` / `feishu` / `wecom` / `telegram` / `cursor` / `kimiCode` / `codebuddy` / `zcode` / `hermes` / `clockWeather`，未知 id 读取时丢弃） | `features/plugins/native/storage.ts` |
| `fly-island-native-plugins-disabled`（`string[]`：手动关闭的已安装内置插件 id；缺失或损坏时按空数组处理，未知和未安装 id 不生效；卸载或重装时清除对应标记） | `features/plugins/native/storage.ts` |
| `fly-island-screenshot-settings`（`{ shortcut, shortcutEnabled, showMagnifier, windowSnapping, showHints, shortcutIssue }`，默认 `Alt+A` 和四个 true；截图插件安装 id 为 `screenshot`，旧配置不自动安装；卸载保留偏好） | `features/screenshot/storage.ts` |
| `fly-island-clock-weather`（`{ showClock, showWeather, location: { name, latitude, longitude } | null }`；两个开关缺省为 true，非法位置为 null，坐标必须为有限数且在地理范围内；重装打开两个显示开关，设置更新从最新记录合并，选中有效城市或主动定位才更新城市） | `features/weather/storage.ts` |
| `fly-island-weather-cache`（`{ latitude, longitude, temperature, code, observedAt, fetchedAt }`；temperature 为摄氏数值，code 为 WMO 整数，时间均为 Unix 毫秒；只显示坐标匹配且观测/获取均未超过三小时的数据） | `features/weather/storage.ts` |
| `fly-island-centered-clock`（`{ showTime, showDate, showSeconds, showWeekday, hourCycle, dateFirst, dateFormat }`；格式值容错归一化，默认显示 24 小时制时间；停用或卸载时保留） | `features/centered-clock/storage.ts` |
| `fly-island-wechat-message-preview-enabled`（字符串 `"true"` 开启，缺失或其他值关闭） | `features/messages/wechat/storage.ts` |
| `fly-island-wechat-hide-minimized-taskbar`（字符串 `"true"` 开启，缺失或其他值关闭） | `features/messages/wechat/storage.ts` |
| `fly-island-translation-settings` | `features/translation/storage.ts` |
| `fly-island-agent-approval`（`{ onIsland, whenInFront }`：Agent 的权限请求在岛上审批，默认关；`whenInFront` 为会话窗口在前台时也弹卡片，2026-11-09 起不再是设置项，读取时总按默认（关）；开着时岛屿让审批端点挂起请求） | `features/agent-status/approvals/storage.ts` |
| `fly-island-agent-hidden-sessions`（`{ "<provider>:<sessionId>": updatedAt }`：在 Agent 页手动移除的会话，只隐藏不删记录；值是移除时那一轮的开始时间（以前存的是最后写入时间），开始新一轮才自动回来，最多 200 条） | `features/agent-status/hiddenSessions.ts` |
| `fly-island-agent-seen-turns`（`{ "<provider>:<sessionId>": 轮次 }`：在 Agent 页看过的会话，轮次是这一轮的开始时间，卡在半路时是最后写入时间；重启岛屿后看过的不再提醒，最多 300 条） | `features/agent-status/unseen.ts` |
| `fly-island-agent-session-filters`（2026-11-09 起不再读写：隐藏会话规则已去掉，旧规则不再生效；格式曾为 `[{ kind: "folder" | "prompt", value }]`） | — |
| 外观主题文件（2026-11-08 起；`fly-island-theme-<日期时间>.json`，写到「下载」文件夹，命令 `save_theme_file`，Rust 端按文件名前缀和内容放行；`{ app: "fly-island", kind: "theme", version: 1, name, exportedAt, appearance }`，`appearance` 只含 `features/appearance/settings.ts` 的 `APPEARANCE_SETTING_KEYS`；导入时只读这些字段，叠在当前设置上经 `normalizeSettings` 校验后存成一个新的样式预设，不自动应用） | `features/appearance/theme.ts` |
| `fly-island-locale` | `i18n/index.ts` |
| `fly-island-community-invite-seen`（`"true"`：在「关于」里点开过用户交流群；没有或其他值时，岛屿的设置按钮、侧栏「关于」和交流群那一行显示红点。2026-11-12 起） | `features/updater/storage.ts` |
| `fly-island-auto-update`（`"false"`：关闭自动更新，只在「关于」里手动检查；缺失或其他值都算开启。开启时启动检查、每 3 小时再查、失败退避重试，下载好后在小岛收起且 1 分钟无交互时自动安装。2026-11-13 起） | `features/updater/storage.ts` |
| `fly-island-update-dot-seen`（2026-11-14 已移除：更新红点不再记录已看过，只要有待安装的更新（含安装失败）就显示，直到安装。旧数据不再被读取，可以残留） | 已删除 `features/updater/storage.ts` 中的读写 |
| `fly-island-update-channel`（`"stable"` / `"beta"`；3.0.2 及更早的设置写入，现已不读，一律按稳定版检查） | — |

## 笔记本电池

- 电池是插件市场里的内置插件：`fly-island-native-plugins` 的 id 列表接受 `battery`；启用状态沿用市场卡片的开关（`fly-island-native-plugins-disabled`），没有自己的开关字段。
- `fly-island-settings` 的 `collapsedLayout` 和 `pageOrder` 接受 `battery`，旧布局的相对顺序保留；未安装时这一位不显示、位置保留。
- `batteryDisplayMode` 保存收起态的读数，取值 `percent`（缺省）或 `remaining`；其他值按缺省读取。
- `batteryReadoutStyle` 保存收起态的读数样式，取值 `inverted`（缺省）或 `badge`；其他值按缺省读取。
- `batteryHistoryEnabled` 保存电量曲线开关，缺省为 `true`。采样只驻留内存，关闭曲线或卸载插件时清除；电池页显示最近 24 小时。
- `get_notebook_battery(includeDetails)` 返回 `{ percent, pluggedIn, charging, secondsRemaining, details }`。已确定无内置电池时返回 `null`。未知字段为 `null`，`details` 包含 `remainingMwh`、`fullMwh`、`designMwh` 和有符号 `rateMw`。电池遥测仅在内存中使用。

## 媒体诊断命令

新增命令 `get_media_diagnostics()` 返回 `{ players }`：逐会话的 `sourceAppId`、`label`、`hasSession`、`hasTimeline`、`hasPluginTrackId`、`exePath`、`directory`、`version`、`status` 与 `neteasePluginState`（非网易云为 null），并补入正在运行但没有会话的已知播放器。只读检查，不安装插件。`get_media_state` 新增 `hasTimeline` 布尔字段；前端兼容缺少字段的旧状态，估算位置始终保留 false 标记。

## 本机字体

`list_installed_fonts(locale)` 按需读取 Windows DirectWrite 中已安装的字体。返回 `{ family, label }[]`，`family` 用于设置与 CSS，`label` 为本地化显示名。`fly-island-settings.fontFamily` 增加 `"local"`，对应名称保存在 `localFontFamily`。两项均可随外观预设保存。

## 微信只读探测输出

`examples/wechat_reminder_probe.rs`（2026-11-13 起）在监听或路径解析报错前向标准输出增加一条 `phase: "executableResolution"` JSON：`registryExecutable`、`runningExecutable`、`selectedExecutable` 和 `explicitExecutable` 均为路径字符串或 `null`，分别表示注册表候选、主窗口优先的运行路径、最终采用路径及 `--exe` 参数。原有监听状态、事件计数字段和退出码不变；这条诊断不进入 Tauri 事件或持久化存储。详见 [微信提醒兼容性说明](../wechat-reminder-compatibility.md#只读诊断)。

## 剪贴板命令（2026-11-13）

- `delete_clipboard_history_items({ ids: string[] })` 返回完整历史快照；一次操作最多写盘一次、广播一次 `clipboard-history-changed`，显式选中的收藏也删除；未知或重复 ID 忽略。原 `clear_clipboard_history` 保留原语义。
- 剪贴板缩略图按需读取（3.1.0）：`clipboard-history.json` 与 `get_clipboard_history` 快照里的 `image.thumbnailDataUrl` 不再写出（字段可选）；缩略图只存在 `clipboard-images/` 的 `-thumb.png`，由新命令 `read_clipboard_history_thumbnail({ id: string })` 返回 PNG data URL，路径限制同下。旧存档首次加载时把内嵌缩略图搬到文件（文件已在则直接去掉内嵌数据；无法写出的保留内嵌，命令原样返回），然后重写一次存档。旧版本读新存档不报错，只是列表里没有缩略图。
- `read_clipboard_history_image({ id: string })` 返回 PNG data URL；只允许历史条目引用的 `clipboard-images/` 直接子文件，拒绝目录外路径、父目录跳转、非 PNG 和大于 10 MiB 的内容。路径由原生端按 ID 查找，前端不传路径。

## 事件


| 事件名 | 发送方 | 目标 |
|---|---|---|
| `island-position-changed` | `island/mod.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-position-cleared`（无载荷：岛屿跟随鼠标或前台窗口换了显示器，拖动保存的位置作废，主窗口清掉 `fly-island-position`） | `island/follow.rs` | 主窗口 |
| `island-top-attachment-changed`（载荷为 `bool`：岛屿是否贴住所在显示器顶边） | `island/top_edge.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-hover-changed`（载荷为 `bool`：光标是否在岛屿形状内，供悬停展开使用） | `island/passthrough.rs` | 广播（通过主窗口对象调用 `emit`） |
| `island-cursor-moved`（载荷 `{ x, y }`：光标在主窗口 CSS 像素中的位置，窗口外也有；只在 `set_island_cursor_tracking(true)` 后、光标移动时发，约 28 次/秒，供中心图案的眼睛跟随） | `island/passthrough.rs` | 广播（通过主窗口对象调用 `emit`） |
| `foreground-fullscreen-changed`（载荷为 `{ active, onIslandMonitor, browserOnIslandMonitor }`：前台是否有全屏程序、是否占住岛所在的显示器、前台是否是浏览器且在岛所在的显示器，供游戏模式和浏览器自动贴边使用） | `system/fullscreen.rs` | 广播 |
| `media-session-changed`（无载荷：某个媒体会话的时间线、播放状态或歌曲变了，或会话增减；主窗口收到后立即重读 `get_media_state`。2026-11-11 起） | `media_control/watcher.rs` | 广播 |
| `clipboard-history-changed` | `clipboard_history/service.rs`（常量在 `mod.rs`） | 广播 |
| `clipboard-history-shortcut` | `clipboard_history/service.rs`（常量在 `hotkey.rs`） | 广播 |
| `clipboard-history-shortcut-status`（载荷为字符串或 `null`：剪贴板快捷键注册失败的原因，成功或关闭时为 `null`；最近一次结果也可用 `get_clipboard_shortcut_error` 读取） | `clipboard_history/hotkey.rs` | 广播 |
| `qq-mail-changed` | `mail/service.rs`（常量在 `mod.rs`） | 广播 |
| `qq-notifications-changed` | `qq_notifications/mod.rs` | `main`、`settings` |
| `telegram-notifications-changed` | `telegram_notifications/mod.rs` | `main`、`settings` |
| `wechat-reminder-changed` | `wechat_reminders/mod.rs` | `main`、`settings` |
| `office-im-changed`（载荷 `OfficeImSnapshot`：`revision` 与 `dingtalk` / `feishu` / `wecom` 各自的 `enabled`、`status`、`pending`、`lastAttentionAt`、`error`） | `office_im/mod.rs` | `main`、`settings` |
| `translation-window-opened` | `translation/mod.rs` | 广播 |
| `translation-island-shortcut`（翻译设为「岛内页面」时按下翻译快捷键：先唤出主窗口，再让它切换翻译页） | `translation/mod.rs` | 广播 |
| `tray-visibility-changed`（载荷布尔值：从托盘菜单「隐藏托盘图标」或设置开关改变后的可见性；启动超时兜底显示不发） / `tray-check-updates`（无载荷：托盘「检查更新」，主窗口打开设置的更新部分并检查） | `tray.rs`、前端 `windows/settings/api.ts` | 广播 / `main` |
| `settings-open-requested`（无载荷：托盘、翻译窗口或独立设置窗口要打开设置，主窗口按 `fly-island-detached-settings` 决定打开岛上的设置页还是独立窗口） | `settings_window/mod.rs`、前端 `windows/settings/api.ts` | `main` |
| `fly-island-update-state` / `fly-island-update-request`（更新状态由主窗口广播；独立设置窗口用后者请求 `snapshot` / `check` / `install` / `dismiss`，以及 `{ action: "auto", enabled }` 切换自动更新（2026-11-13 起）；3.0.2 及更早还有 `channel`。状态里多了 `autoUpdate` 布尔字段） | `features/updater/updaterController.ts` | 广播 / `main` |
| `agent-approval-requested`（载荷 `{ id, agent, kind, sessionId, cwd, toolName, toolInput, permissionSuggestions, receivedAt }`：一个会话等你在岛上审批的工具调用（`kind: "permission"`），或要你回答的 AskUserQuestion（`kind: "question"`，`toolInput.questions`），同一会话同时只发一条） | `agent_approval/mod.rs` | 广播 |
| `agent-approval-closed`（载荷 `{ id, reason }`，`reason` 为 `decided` / `timeout` / `disconnected` / `handedBack` / `shutdown`） | `agent_approval/mod.rs` | 广播 |

## 其他

- 诊断包（2026-11-25）：`export_diagnostic_bundle({ title, settings })` 先打开 Windows 原生 ZIP 保存对话框；成功返回所选路径，取消返回 `null`。开启/关闭文件日志均可导出，不修改日志开关或应用设置。

- 结构化诊断（2026-11-25）：新增 `record_diagnostic({ diagnostic: { category, name, fields } })`；仅记录允许的事件名及字段，关闭文件日志时只保留在内存。既有日志命令、事件、设置及磁盘路径不变。内置命令不需要新增插件 ACL。
- 浏览器贴边诊断：`island / browser_auto_tuck` 只在决策变化时记录稳定的 `reason`，包括贴边、接管、阻止、等待悬停、恢复与禁用；`fullscreen / foreground` 增加布尔字段 `browser` 和 `browser_on_island_monitor`。不记录注册路径或用户内容，无新增 IPC 或设置字段。

- 每日 Markdown 反向同步（2026-11-19，issue #88）：新增 localStorage key `fly-island-todo-file-sync`，字符串 `"true"` 才开启，缺失、损坏或其他值均关闭。现有待办、笔记、归档、最后保存签名和保存目录 key/格式不变。设置修改同页通过 DOM 事件 `fly-island-todo-file-sync-changed` / `fly-island-todo-save-directory-changed` 同步，跨原生窗口继续使用 `storage` 事件；不是 Tauri 事件。
- 新增原生命令 `read_todo_markdown({ directory, date })`，返回 `{ filePath, version, modifiedAt, content }`：缺失文件后三项为 null；时间为 Unix 毫秒，version 为内容 SHA-256 与文件修改时间组成的不透明字符串。只允许绝对目录与真实 `YYYY-MM-DD`，只读取 UTF-8 且不超过 4 MiB 的每日文件。
- 新增 `save_todo_markdown_if_unchanged({ directory, date, content, expectedVersion, recoveryContent })`，返回 `{ saved, snapshot }`，snapshot 与读取命令同型。版本不符（包括文件不存在/被新建）时 `saved: false` 并返回新快照，不写入；在 Windows 写入/删除排他锁内比较和写入。`recoveryContent` 为 null 时普通写入，否则先在同一目录创建两侧冲突副本。恢复副本是 `YYYY-MM-DD.conflict-<Unix 纳秒>-island.md` / `-file.md`，不被当作每日文件读取。既有 `save_todo_markdown` 契约和关闭开关时的行为不变；本应用命令不需要额外插件权限。

- 测试版通道（2026-11-18）：`updater_check` 新增可选参数 `allowDowngrade`（缺省 false，与旧版相同）；为 true 时清单里任何不同的版本都算更新，用于从测试版还原到正式版。`channel` 仍为 `"stable"` / `"beta"`。主窗口与设置窗口之间的 `fly-island-update-request` 新增 action `beta`、`restore`，`fly-island-update-state` 新增字段 `target`。无新增 localStorage key。
- 托盘（2026-11-19）：新增命令 `set_tray_language({ language })`（`"en"` 为英文，其余为中文）与 `set_tray_visible({ visible })`。托盘图标启动时先隐藏，主窗口同步 `fly-island-tray-visible` 后决定显示与否；3 秒内没有同步时兜底显示。托盘隐藏时再次启动 Fly Island 会额外打开设置。无新增应用数据文件。
- 问题排查日志（2026-11-18）：新增命令 `get_app_log_state()`、`set_app_log_enabled({ enabled })`（都返回 `{ enabled, path, bytes }`）、`append_app_log({ entries: [{ level: "error" | "warn", message }] })`、`open_app_log_folder()`、`clear_app_log()`，事件 `app-log-changed`（payload 为是否开启）。应用数据目录新增 `app-log.json` 与 `logs/fly-island.log`、`logs/fly-island.1.log`。无新增 localStorage key。
- `fly-island-settings` 的 behavior 块增加 `keepVisibleWhileAgentRunning`、`keepVisibleWhileLyrics`、`keepVisibleWhileTodoRunning`（2026-11-13）：三项独立布尔值，默认 false；缺失或非 boolean 回退 false。仅暂停收起态闲置贴边计时，不新增 key、命令或事件。
- `fly-island-settings` 新增 `topEdgeShoulders`（boolean，默认 false）和 `topEdgeShoulderSize`（整数 4–20px，默认 10）；无效或缺失回退默认，大小超界夹取，只影响贴顶的装饰外形，不增加原生点击区域。属于外观字段，恢复默认外观会一并复位。

- DSH（issue #51）：新增只读命令 `get_dsh_usage()`，返回 `null` 或 `{ updatedAt, available, wallets: [{ currency, total, granted, toppedUp }], source: "dshApi" | "dshAccount" }`，金额为十进制字符串。`list_agent_sessions` 的 `provider` 新增 `dsh`；`focus_agent_window`、`agent_sessions_in_front` 接受 `dsh`，既有参数和返回结构不变。无新增事件，无新增 localStorage key；`fly-island-settings` 兼容新增 `agentShowDsh`（缺失时为 true）。`agent-status.json`、钩子安装状态仍只含 Claude/Codex。该命令是自有 Rust 命令，不增加 Tauri 插件/核心权限；现有 capabilities 足够。
- WorkBuddy 使用 `open_workbuddy_login()`、`get_workbuddy_usage({ refreshNow?, cachedOnly? })` 和 `disconnect_workbuddy()`。读命令及 `workbuddy-usage-changed` 事件的状态为 `signedOut`、`loginRequired`、`ready`、`unavailable` 或 `connected`。只有 `connected` 带 `usage: { remaining, total, updatedAt }`，金额为数值，时间为 Unix 毫秒。事件发到 `main` 和 `settings`。远程 `workbuddy-sign-in` 窗口在本地 capability 之外。
- WorkBuddy 官方登录凭据另存在 Windows 凭据管理器 `com.flyisland.app.workbuddy-web`，与 Cookie 条目并存。每片最多 2400 字节，`oauth-login-active` 的 JSON 为 `{ bank: "Primary" | "Alternate", chunks: 1..8 }`，指向 `oauth-login-<0..7>` 或 `oauth-login-alt-<0..7>`。完整写入另一组后才切换索引，失败保留原快照；兼容读取旧单条 `oauth-login`，成功保存后清理旧条目。主动断开清理两组、索引和旧条目。`unavailable` 可带 `reason: "curlUnavailable"`，原有状态、参数和存储不变。

- 展开岛屿的按钮样式保存在 `fly-island-settings.pageButtonStyle`，支持 `capsule`（胶囊）、`icon`（图标）和 `iconLabel`（图标加文字）。缺失或未知值使用默认值 `icon`。旧版本读取 `iconLabel` 时也使用默认图标样式。
- 微信摘要通过 `set_wechat_message_preview_enabled(enabled)` 开关。`set_wechat_minimized_taskbar_hidden(hidden)` 设置最小化时隐藏微信任务栏图标。`set_wechat_reminders_enabled` 可接收 `previewEnabled` 和 `hideMinimizedTaskbar`，省略时保留对应偏好。事件快照包含 `previewEnabled`、`previewStatus`、`hideMinimizedTaskbar`、`messages`，消息行是 `{ id, receivedAt, contact, body }`。
- `open_wechat_conversation(messageId)` 用内存中的摘要 ID 定位微信会话。返回 `true` 表示已点击对应会话，`false` 表示已打开微信主窗口。微信的会话标识和进程身份保存在原生内存中。
- 办公消息（2026-11-18，插件市场的钉钉 / 飞书 / 企业微信）：`get_office_im_state()`、`set_office_im_enabled(client, enabled)`、`clear_office_im(client)`、`open_office_im(client)`，`client` 为 `dingtalk` / `feishu` / `wecom`。监听任务栏闪动（shell hook），只在至少一个客户端开启时运行；`open_office_im` 只恢复已在运行的客户端主窗口（飞书关到托盘时再启动一次飞书自己的程序，由飞书显示窗口），不执行协议、不模拟输入，并清除该客户端的提醒。
- `clear_wechat_reminders()`（2026-11-13）清除岛内微信镜像：`pending=false`、清空 `messages`、`revision+1`，返回 `ReminderSnapshot` 并沿用 `wechat-reminder-changed` 推送；发给 settings 的快照仍剥除消息。不会操作微信客户端的已读状态或偏好。为本应用命令，不使用额外插件/核心权限；现有 `capabilities/default.json` 的本地窗口范围足够。
- `dismiss_wechat_conversation(messageId)`（2026-11-14）清掉 `messageId` 所在会话（按会话 key）的全部摘要，保留其他会话；最新一次提醒属于该会话时同时 `pending=false`，`lastAttentionAt` 不变。返回 `ReminderSnapshot`，沿用 `wechat-reminder-changed` 推送；找不到 ID 时原样返回。前端在打开会话成功后调用。
- `dismiss_qq_contact(title)`（2026-11-14）清掉通知标题等于 `title`（联系人或群名）的全部 QQ 通知，保留其他人，返回 `QQNotificationSnapshot` 并沿用 `qq-notifications-changed` 推送。两条命令都只改内存中的镜像，不新增 localStorage key 或事件，不需要额外权限。
- `get_telegram_notification_state()`、`set_telegram_notifications_enabled(enabled)` 和 `open_telegram_notification(id)` 返回 Telegram 快照。消息行包含 `id`、`title`、`body`、`createdAt`。打开命令使用应用内的消息 ID。TG 确认收到对话激活请求后，`open_telegram_notification` 按 Windows 通知 ID 移除原始通知，之后才从岛内移除对应消息。`open_telegram()` 打开 TG 桌面应用。`request_telegram_notification_access()` 和 `open_telegram_notification_settings()` 分别请求 Windows 通知读取权限和打开该权限的系统设置。Telegram 是插件市场内置插件（id `telegram`）：没装时消息页没有标签、原生监听保持关闭；主窗口按「已安装且启用且接收开关打开」调用 `set_telegram_notifications_enabled`，原生默认关闭。事件 `telegram-notifications-changed` 的载荷为 `{ snapshot, newestId }`。
- `open_wechat` / `open_wechat_conversation` 失败时返回错误码 `wechat-open:not-installed`、`wechat-open:no-main-window`、`wechat-open:restore-failed`、`wechat-open:launch-failed`，由前端翻译成中英文提示；微信未运行时这两个命令会尝试启动它（会话命令随后返回 `false`）。
- 应用数据目录的 `wechat-accessibility.json` 记录 `{ pid, started_at }`，用于重新校验进程并恢复岛屿临时开启的微信辅助功能标志。

- 窗口 label：`main`、`translation`、`settings`、`clipboard`（3.1.0 新增）；前端分发参数为 `?window=translation`、`?window=settings`、`?window=clipboard`。
- Tauri 命令：以 `lib.rs` 中 `generate_handler!` 列表为准，命令名即 Rust 函数名。
- 应用标识 `com.flyisland.app`，凭据服务名 `com.flyisland.app.qq-mail`、`com.flyisland.app.translation`、`com.flyisland.app.workbuddy-web`（WorkBuddy 登录 Cookie 副本，用户名 `cookies-active` 的 JSON 为 `{ bank: "Primary" | "Alternate", chunks: 1..8 }`，两组分别使用 `cookies-<0..7>` 和 `cookies-alt-<0..7>`，缺少索引时读取旧版 `cookies-<0..7>`。各段连接后为 Cookie JSON 数组，可选 `same_site` 取值 `Strict`、`Lax` 或 `None`，缺省兼容旧副本）、`com.flyisland.app.zcode-coding-plan`（用户名 `usage`，保存 Z Code Coding Plan 平台与 API Key）。
- 注册表值：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 下的 `Fly Island`。
- Hook 受管区块标记：`# BEGIN/END Fly Island Agent Status Hooks`，命令签名前缀 `fly-island-agent-`。
- 更新端点与 `latest.json` 格式：见 `tauri.conf.json` 和 `docs/updater.md`。
- 在岛上审批（2026-11-06 起）：端点路径 `POST /claude/permission-request`、`POST /codex/permission-request`，以及 Claude Code `PreToolUse` 钩子的 `POST /claude/ask-user-question`（只接 AskUserQuestion，回答以 `updatedInput.answers` 返回），以及 Claude Code 动静钩子的 `POST /claude/activity`（2026-11-07 起；请求体是 `PostToolUse` / `PostToolUseFailure` / `PermissionDenied` / `Stop` / `SubagentStop` / `UserPromptSubmit` 的钩子输入，总是回 `{}`，用来撤掉已在终端答过的卡片，事件 `agent-approval-closed` 的 `reason` 为 `answeredElsewhere`）（`Authorization: Bearer <令牌>`，`Host` 须为本机端口，带 `Origin` 的请求拒绝），返回 Claude Code `PermissionRequest` 钩子的格式，空对象 `{}` 表示交还终端；`agent-approval.json` 字段 `port`、`token`；Tauri 命令 `set_agent_approval_enabled`、`agent_approval_decide`（`decision` 为 `allow` / `deny` / `allowAlways` / `terminal`；提问为 `answer` 加 `answers`（问题原文 → 回答）或 `terminal`）、`agent_approval_pending`；事件见上表。
- 歌词缓存（2026-11-06 起）：应用数据目录下的 `lyrics-cache/<FNV-1a 哈希>.json`（`{ key, lrc, source?, translation?, wordTimes?, durationMs?, durations?, fetchedAt }`；`lrc` 可带增强 LRC 的逐字时间 `<mm:ss.xx>`（酷狗 KRC 转来）；`wordTimes` 为 true 的条目由保留逐字时间的版本写入，没有它的酷狗旧条目会重新下载；`durations` 为 true 的条目由记录歌曲时长的版本写入（`durationMs` 是来源给的时长，可为空），没有它的旧条目会重新查一次（2026-11-10）；`lrc` 为 null 表示所有在线来源都没有，7 天后重查；`source` 为 `lrclib` / `kugou` / `netease`，没有时是 LRCLIB 的旧条目；开着中文来源时 key 末尾多 `cn`；最多 2000 个文件）。设置项 `lyricsFolder`、`lyricsOnline`（2026-11-10 起默认开，保存过 false 的仍为关）、`lyricsChinese`（也查酷狗和网易云，同样默认开）、`lyricsOffsetMs`。每首歌自己的偏移存在 localStorage `fly-island-lyrics-offsets`（`{ <歌名歌手时长/2 秒>: 毫秒 }`，±10 秒，最多 500 首）。媒体状态多了 `trackId`：播放器插件写进流派的歌曲 ID（`NCM-<id>`、`QQ-<id>`），`get_lyrics` 的查询多了 `chinese`、`trackId`，返回值多了 `translation`，2026-11-10 起还有可选的 `durationMs`（来源给的歌曲时长，播放器不报告时长时用于进度条）。
- 岛屿设置 `fly-island-settings` 的 `collapsedPriority`（`agent` / `lyrics` / `todo` / 可选插件 `centeredClock` 的展示优先级；旧设置缺少居中时钟时按默认顺序附加到末尾）、`collapsedShowCover`（布尔，默认 false）、`pageOrder`（展开岛顶栏页面圆点）与 `collapsedLayout`（折叠岛文字和状态图标的位置）；读取时去掉未知和重复项，缺的按默认顺序补在末尾。
- 岛屿设置 `fly-island-settings` 的 `pageOrder` 2026-11-11 起多一个可选项 `"translation"`（翻译的页面胶囊），默认顺序 `["todo","music","clipboard","shelf","translation"]`；旧数据缺它时按上面的规则补在末尾，旧版本读到它会当未知项丢掉。
- 岛屿设置 `fly-island-settings` 2026-11-11 新增 `autoCollapseSeconds`（整数秒 0–600，0 表示从不；鼠标离开展开的岛多少秒后收起）和 `tuckDelaySeconds`（整数秒 3–600，默认 30；收起的岛闲置多少秒后贴边成细线）。`autoCollapseSeconds` 最初只存 3 / 5 / 10 / 30 / 0，这些值照旧有效；非数字或旧数据没有这个字段时：`autoTuck` 为 true 读成 30，否则读成 0；超出范围按边界读。旧版本存过的 `autoTuckSeconds` 不再读取，`tuckDelaySeconds` 缺失时读成 30。
- 岛屿设置 `fly-island-settings` 的 `expandedScale`（展开后的大小）2026-11-10 重新可以设置；2026-11-11 起是 0.85–1.2 之间的任意值（滑块，步长 0.01）。3.0.0 存的 0.9 / 1 / 1.1（小 / 中 / 大）原样保留；更早版本存的任意数（原范围 0.75–1.4）读取时限制到 0.85–1.2 并取到百分位，非数字按 1。字段名和类型不变。
- `fly-island-settings` 新增 `islandFontPercent`（90–120，默认 100，步长 5）、`collapsedAutoWidth`（默认 true）、`collapsedWidth`（240–480，默认 340）和 `collapsedHeight`（32–60，默认 38；2026-11-19 起下限 26）。宽高以缩放前的逻辑像素存储。`set_island_interaction` 接收实际使用的 `collapsedWidth` 及可选的 `collapsedHeight`，缺少高度时使用当前状态的高度，初始值为 38。
- `fly-island-settings.agentQuotaSources` 保存可见额度环，候选值依次为 `claudeCode`、`codex`、`dsh`、`workbuddy`。旧数据缺少该字段时用原有会话来源开关迁移三种来源，并选中 WorkBuddy。保存空数组表示隐藏额度行。
- 胶囊外形（2026-11-18）：`fly-island-settings` 兼容新增 `islandShape`（`"notch"` / `"capsule"`，缺失或其他值时为 `"notch"`，与旧版外形相同；胶囊暂未开放期间 `"capsule"` 也读成 `"notch"`），属于外观字段，随外观预设保存和应用。胶囊只改变前端发给 `set_island_interaction` / `set_island_layout` 的 `marginY`（至少 8）与 `collapsedCornerRadius`（条高的一半），命令和参数不变，不新增事件或 localStorage key。
- 插件市场 Agent（2026-11-18）：`list_agent_sessions` 新增可选参数 `native: string[]`（`"cursor"`、`"kimiCode"`、`"hermes"`），缺省时与旧版一样不读这几个来源；返回的 `provider` 新增 `cursor`、`kimiCode`、`hermes`。`focus_agent_window`、`agent_sessions_in_front` 接受 `cursor`（另两个走通用的终端匹配）。新增只读命令 `get_kimi_usage()`、`get_zcode_usage()`，返回 `null` 或与 `get_agent_usage` 相同的 `AgentUsage`，`source` 新增 `"kimi"` / `"zcode"`。`fly-island-settings` 兼容新增 `agentShowCursor`、`agentShowKimiCode`、`agentShowHermes`、`agentShowZcode`（缺失时为 true，仅在 `fly-island-native-plugins` 装了对应插件时生效）；`agentQuotaSources` 的取值不变。无新增事件或 localStorage key。
- Z Code Coding Plan API Key（2026-11-20）：新增 `get_zcode_api_key_settings()`、`save_zcode_api_key_settings(platform, api_key)` 和 `clear_zcode_api_key()`。平台取值为 `bigmodel` / `zai`；`api_key: null` 只更新平台，清除 Key 保留平台。设置与 Key 存 Windows 凭据管理器 `com.flyisland.app.zcode-coding-plan` / `usage`，返回字段 `maskedKey`（Rust `masked_key`）在没有 Key 时为 `null`，有 Key 时显示 `····` 加后四位，四位及以下只显示 `····`。Key 优先于 Z Code 桌面登录；未配置 Key 时仍走原凭据路径。设置页保存或清除后查询额度并广播 `zcode-usage-changed`，载荷为 `AgentUsage | null`，岛屿用来即时更新额度环。
- WorkBuddy 会话（2026-11-13）：`list_agent_sessions` 的 `provider` 新增 `workbuddy`；`focus_agent_window`、`agent_sessions_in_front` 接受 `workbuddy`，既有参数和返回结构不变。`fly-island-settings` 兼容新增 `agentShowWorkbuddy`（缺失时为 true），旧数据迁移额度环时 WorkBuddy 跟随此开关。无新增命令、事件或 localStorage key。
- 岛屿设置 `fly-island-settings` 的 `gameDoNotDisturb`（布尔，默认 true）2026-11-11 重新可以设置（通用 → 岛屿 → 游戏模式）：只有明确存为 false 才关；`gameAutoTuck` 仍按默认 false 读取。字段名和类型不变，没有新 key。
- 岛屿设置 `fly-island-settings` 2026-11-17（3.2.6）新增 `ctrlWheelPages`（布尔，默认 false）：只有明确存为 true 才开，展开时按住 Ctrl 滚动滚轮按顶栏顺序切页。旧数据缺失或类型无效时为关。没有新 key。
- 开机自启（2026-11-17，3.2.6）：注册表值名仍是 `Fly Island`，命令行改为 `"<exe>" --autostart`，用来区分开机启动（岛屿显示时不抢焦点，QQ / 微信监听与网易云插件自动安装错峰延后）。旧版本写的无参数值照常生效，启动一分钟后在后台改写成新格式一次。命令 `get_launch_at_startup` / `set_launch_at_startup` 不变。
- 自启更名迁移遇到两份 Run 记录时，保留 `Fly Island` 的启动命令和 Windows 启用状态，清理旧名称的重复记录。只有旧名称时，用当前可执行文件和 `--autostart` 注册新值，保留原启用状态。成功写入新值后清理旧记录。
- 卸载清理（2026-11-17，3.2.6）：可执行文件新增命令行参数 `--remove-agent-hooks`，由卸载程序在勾选「Delete the application data」且不是更新卸载时调用（`src-tauri/nsis/installer-hooks.nsh` 的 `NSIS_HOOK_PREUNINSTALL`），只删 Codex 受管区块、Claude Code 里带 `fly-island-agent-` 签名的条目和回复标记规则文件，随后退出，不启动岛屿。
- 新增 Tauri 命令 `set_island_game_quiet`（`quiet: boolean`，2026-11-17）：前端把游戏模式的 quiet 告诉原生侧，贴边的岛在游戏全屏时不再命中、不置顶、不抢焦点。
- 岛屿设置 `fly-island-settings` 新增 `positionLocked`（布尔，默认 false）：只在明确保存为 true 时禁止拖动。旧数据缺失或类型无效时保持可拖动。`set_island_interaction` 增加可选参数 `positionLocked`，缺失时按 false；`start_island_drag` 在锁定时不启动拖动。复位和贴边隐藏不受影响。
- 2026-11-13：同一设置对象新增 `tuckStyle: "edge" | "line" | "hidden"`，前端缺失或非法值回退 `"line"`；旧存档通过上表的完成标记统一迁移一次为 line，随后尊重手动选择。`set_island_interaction` 新增可选 `tuckStyle`（Rust `tuck_style: Option<String>`，camelCase 映射），原生命令未传或未知值仍按 `edge` 兼容旧客户端。仅贴边时改变可见高度和命中区域，现有命令名、参数、事件与存储 key 保持兼容。`autoTuck` 缺失或非布尔时按默认 true，明确保存 false 仍关闭。
- Agent 页显示方式（2026-11-07 起）：设置项 `agentSessionView`（`list` / `cards` / `compact`，默认 `list`）、`agentArchiveMotion`（`slide` / `dissolve`，默认 `slide`）、`agentCardEffects`（`off` / `sparkle` / `gradient`，默认 `off`）；`AgentSessionSummary.contextTokens`（最近一次模型调用的上下文 tokens，Claude Code 取 usage 的输入、缓存读写与输出之和，Codex 取 `token_count` 的 `last_token_usage.total_tokens`；不知道时为 null）。
- 回复状态标记（2026-11-08 起换位置）：写在 Claude 配置目录（`CLAUDE_CONFIG_DIR`，默认 `~/.claude`）下的 `rules/fly-island-reply-marker.md`，块标记 `<!-- fly-island: reply marker v2 -->`；关掉时只删除含这个标记的文件。v1 写在 `CLAUDE.md` 里的块在打开或关掉时移除，`CLAUDE.md` 的其他内容不动；软链文件一律不写。
- Agent 页排列（2026-11-08 起）：设置项 `agentSessionSort`（`status` / `recent` / `firstSeen`，默认 `status`；旧数据没有这个字段时按 `status`，会改变升级前的顺序）、`agentSessionGroup`（`computer` / `project` / `none`，默认 `computer`）；`agentHostDisplay` 的默认值改为 `icon`（已保存的值不变）。
- Antigravity 会话与额度（插件市场可选安装，作者 lilipeng0615-cyber）：`list_agent_sessions` 的 `native` 接受 `"antigravity"`，返回的 `provider` 为 `antigravity`；会话摘要来自 `~/.gemini/antigravity`、`antigravity-cli`、`antigravity-ide` 的 `conversation_summaries.db`（主库和 `-wal` 复制到系统临时目录下本进程新建的 `fly-island-sqlite-*` 文件夹后读副本、读完即删，原文件不加锁、不写入、目录里不建 sidecar；大小和修改时间未变时不重读；2026-11-26 前用 `immutable=1`，看不到 WAL 中的新写入），`brain/<id>/.system_generated/logs/transcript.jsonl` 只读末尾 256 KB。新增只读命令 `get_antigravity_usage()`：只连 `127.0.0.1`，端口须由 Antigravity 语言服务器进程监听，禁用代理和重定向，3 秒超时，失败返回 `null`；返回 `AgentUsage`，`source` 为 `"antigravity"`，额度按模型放在 `models`，`five_hour`/`seven_day` 为 `null`。`fly-island-native-plugins` 取值新增 `antigravity`；`fly-island-settings` 兼容新增 `agentShowAntigravity`（缺失时为 true，仅在装了插件时生效），`agentQuotaSources` 可选 `antigravity`。未安装或开关关闭时不读文件、不发请求。

- 待办设置（2026-11-12）：现有 `fly-island-settings` 对象增加 `todoTimerEnabled`（boolean，默认 false，仅接受 boolean）、`todoReorderVersion`（固定 1）；`enableTodoReorder` 默认 true。缺少版本标记的旧数据一律开启拖拽，有 `todoReorderVersion: 1` 时才尊重布尔值。没有新增 key 或修改待办数据格式；关闭计时器删除本轮 `fly-island-todo-timer`，保留进行中 ID 和各项时长。
- 待办各项时长（2026-11-12）：新增 `fly-island-todo-durations`（`{ [todoId]: 分钟 }`），取代所有待办共用的 `fly-island-todo-duration`。不迁移旧值：用户明确要求每项待办独立，新待办都从 15 分钟起；旧 key 留在原处不读取。直接点“开始”不再启动倒计时，只有怀表设置里的开始才计时。
- v3.2.6 通知与待办提醒（2026-11-18，均默认关闭）：`fly-island-settings` 兼容新增 `messageAutoExpand`（boolean，默认 false）、`messageExpandMaxWidth`（320–720，步长 20，默认 520）、`messageExpandMaxHeight`（80–360，步长 10，默认 180）、`messageExpandSeconds`（3–60 秒，默认 12）、`gameShowNotices`（boolean，默认 false）、`gameNoticeSeconds`（2–30 秒，默认 4）、`todoTimerReminder`、`todoTimerReminderSound`（boolean，默认 false）。缺失或非法值按默认。`fly-island-todo-timers` 的每项兼容新增可选 `remindMinutes`（1–60）与 `reminded`（boolean）；旧数据缺失时视为不提醒，关闭提醒设置时读取会去掉这两个字段。`set_island_interaction` 新增可选参数 `noticeWidth`、`noticeHeight`（自适应通知把收起岛撑大后的逻辑尺寸，缺失时按原收起尺寸，超出舞台窗口时忽略）和 `clickThrough`（游戏模式通知期间整窗鼠标穿透，缺失按 false）；命令名与原有参数不变。新增 key 见上表 `fly-island-todo-remind-minutes`。

总览见 [overview.md](overview.md)。
# 网易云精准进度插件

- 命令：`netease_plugin_status()` 返回 `NeteasePluginStatus`（state、supported、tested、version、arch、installDir、running、legacyInfLink、pluginDir）；`install_netease_plugin()` / `uninstall_netease_plugin()` 返回 `{ keptForeignLoader, preservedFiles }`；`close_netease({ relaunch })` 结束网易云的全部进程，`relaunch` 为 true 时随后重新打开（只在用户点击“立即重启网易云”或“关闭网易云并继续”后调用）。
- 错误统一为 `{ kind, detail }`，kind 为 Unsupported / NeedsClose / LegacyConflict / HashMismatch / Network / UserDeclined / Busy / Io / Blocked（被安全软件拦截或文件被占用）/ DriveUnavailable（网易云在提权进程看不到的网络盘、映射盘或 subst 盘上）/ LoaderExists（提权期间目录里出现了别的 msimg32.dll）。
- 事件 `media-plugin-progress`：`{ stage: downloading|verifying|copying|done|error, detail?: string|null }`。
- 应用数据 `media-plugins.json`：`{ version: 1, files: [{ path, sha256 }], installedAt }`，installedAt 为 Unix 秒。仅记录本应用写入的文件；卸载只删除仍与记录哈希一致的文件，替换文件保留并返回路径；记录损坏或未知版本容错为空。
- 应用数据 `media-plugins-auto.json`：`{ version: 1, optedOut, attempted: ["<网易云安装目录>|<版本>"] }`，最多保留 8 条；损坏或未知版本按空记录处理（会再自动尝试一次）。命令 `prepare_netease_manual_install` 返回 `{ staged, targetDir }`。
- 启动参数 `--media-plugin-copy <源> <目标> <sha256>`、`--media-plugin-remove <目标> <sha256>` 在 Tauri 和 single-instance 初始化前处理并退出。只接受固定清单的加载器哈希，目标必须为绝对路径 `msimg32.dll`，父目录须有 `cloudmusic.exe`，禁止 `..`、链接与特殊路径。复制前校验源文件，删除前校验目标文件；不启动正常应用窗口。可选的最后一个参数 `--report=<绝对路径>`：失败时 helper 把错误原文写进这个新文件（只接受 `fly-island-plugin-helper-*.txt` 且不覆盖已有文件），父进程读出后删除；管理员是另一个用户时写不进去，只剩退出码。退出码：0 成功，1 未知（也是旧版唯一的失败码），2 参数无效，3 目标目录在提权进程里不可见，4 目标无效，5 哈希不符，6 加载器已存在，7 拒绝访问，8 文件被占用，9 被杀毒软件拦截，10 网易云正在运行。临时文件名为 `<目标文件名>.<pid>-<纳秒>.fly-island-tmp`，复制前会清掉同目录里本应用留下的旧临时文件（含旧版固定名 `msimg32.fly-island-tmp`）。
- 播放器诊断新增 `neteasePluginInactive`：已安装插件但仍无时间线，提示重启及可能不兼容。


- 剪贴板独立窗口（2026-11-13）：岛屿设置新增 `clipboardDetached`（布尔，默认 false；开启后点剪贴板入口或按剪贴板快捷键打开 `clipboard` 窗口而不是展开岛）。localStorage 新增 `fly-island-clipboard-window-pinned`（`"false"` 为不置顶，缺失或其他值为置顶，即默认置顶）。新命令 `open_clipboard_window`、`show_clipboard_window`、`close_clipboard_window`（创建窗口的命令为 async，避免 Windows IPC 线程死锁）和 `show_clipboard_history_island`（剪贴板快捷键事件改由主窗口前端按设置分流，岛内打开时由它显示并聚焦主窗口）。窗口位置存应用数据目录 `clipboard-window.json`。权限新增 `core:window:allow-set-always-on-top`。
- 剪贴板（2026-11-13）：`fly-island-settings.clipboardVisibleRows` 现可设置为 3–8 的整数，缺失或非法值为 4；`set_clipboard_history_settings` 的 `maxItems` 范围扩为 5–500，默认 30，命令、数据字段和历史文件格式不变。
- 剪贴板悬停预览由 `fly-island-settings.clipboardHoverPreview` 控制，只有布尔值 true 开启。岛内和独立剪贴板窗口共享此偏好。
- 配色（2026-11-14）：`fly-island-settings` 新增 `colorScheme`（`"dark"` / `"light"` / `"system"`，缺失或未知值为 `"dark"`），属于外观字段，进外观预设，恢复默认外观会复位。三种自定义颜色字段格式不变；值等于任一配色的默认值时视为跟随配色（`features/appearance/theme.ts`）。新命令 `set_settings_window_theme(dark: boolean)`：只在设置窗口调用，设置它的 DWM 标题栏深浅和窗口底色，无返回值；自有 Rust 命令，不需要新权限。`tauri.conf.json` 去掉 settings、clipboard 窗口固定的 `"theme": "Dark"`。
- 质感（2026-11-14）：`fly-island-settings` 新增 `material`（`"classic"` / `"liquidGlass"` / `"frostedGlass"`），取代旧字段 `appearanceMode`（`"classic"` / `"liquidGlass"`）。读取时 `material` 合法就用它；否则旧的 `appearanceMode: "liquidGlass"` 迁移为 `"liquidGlass"`，其余为 `"classic"`；保存时不再写 `appearanceMode`（`normalizeLayoutSettings.ts`）。属于外观字段，进外观预设。`set_island_interaction` 的 `glassEnabled` 在两种玻璃下都为 `true`，原生侧照旧只回 `"css-fallback"`。
- v3.2.6（2026-11-18）：
  - `fly-island-settings` 新增 `glassBlur`（整数 30–100，默认 60；v3.2.6 起低于 30 的旧值读成 30，外观字段、进外观预设）、`tuckEdgeHeight`（整数 3–20，默认 10，露边贴边时留在屏幕上的高度）、`clipboardCloseOnBlur`（布尔，默认 false，只有明确 true 才开）。`islandCornerRadius`（8–96，默认 42）与 `islandCornerShape`（`squircle` / `round`）重新可以设置：读取时夹到范围内，不再一律回到默认。缺失或非法值回退默认。
  - `fly-island-translation-settings` 新增 `shortcutEnabled`（布尔，缺失视为 true）；`provider` 新增 `google`、`mymemory`（免密钥，旧版本读到会回退 DeepSeek）。
  - 新命令 `start_glass_capture({ onFrame: Channel })` → `boolean`（false 表示系统不支持把岛屿排除出 Desktop Duplication，不采集）、`set_glass_capture_region({ region: { left, top, width, height } | null, blur: 0–100 })`（相对窗口左上角的物理像素，null 暂停）、`stop_glass_capture()`。帧是原始字节：24 字节头（相对窗口左上角的矩形 4×i32 小端，像素宽高 2×u32），后接 RGBA；空消息表示暂停。玻璃采集期间主窗口带 `WCA_EXCLUDED_FROM_DDA`，停止时撤销。
  - `set_island_interaction` 增加可选参数 `tuckEdgeHeight`（缺失时保持当前值，初始 10，Rust 夹 3–20）和 `collapsedCornerRadius`（收起态圆角，Rust 夹 0–40；从未收到时按 `cornerRadius × 12 / 30` 命中测试，与旧版一致）。
  - `fly-island-settings` 新增 `collapsedCornerRadius`（0–40，步长 0.1，默认 16.8）。缺失时按已保存的 `islandCornerRadius × 12 / 30` 推出，旧外观不变；属于外观字段，会进外观预设。
  - 新命令 `get_clipboard_storage_directory()`、`set_clipboard_storage_directory({ directory })`，都返回 `{ directory, defaultDirectory, isDefault }`；空字符串表示移回应用数据目录。剪贴板存储目录选择复用 `pick_folder`。
  - 应用数据目录新增 `clipboard-location.json`（`{ "directory": "<绝对路径>" }`）：存在且可用时剪贴板历史（`clipboard-history.json` 与 `clipboard-images/`）放在该目录；文件缺失、损坏或目录不可用时回到应用数据目录（不删除该文件）。迁移先复制、写指针，全部成功后才删除旧文件。
  - `clipboard-history.json` 的条目新增可选字段 `files: string[]`（资源管理器复制的文件，CF_HDROP）。这类条目 `kind` 仍是 `"text"`、`text` 为每行一个路径，旧版本照常读取并把路径当文本粘贴；没有文件的条目不写这个字段。

## 插件 API v1

- 新目录：`src-tauri/src/plugin_host/`、`src/features/plugins/`、`plugins/<id>/`（独立 crate）、`plugins/sdk/`、`docs/plugins/`。
- 命令：`get_plugins()`、`get_plugins_index()`、`install_plugin(id)`、`set_plugin_enabled(id, enabled)`、`uninstall_plugin(id)`、`set_plugin_setting(id, key, value)`、`run_plugin_action(id, action)`、`configure_plugins(developerMode, indexUrl)`、`load_development_plugin(directory)`。
- 安装进度（2026-11-26）：`install_plugin` 新增可选参数 `enable: boolean`（缺省 false，与旧版一样安装后保持停用或原状态；true 时在同一个任务里启用）。新增命令 `get_plugin_installs()`，返回进行中和失败未重试的任务 `{ id, phase, downloaded, total, error }[]`；新增事件 `plugin-install-progress`（广播，载荷为同一结构）。`phase` 为 `downloading` / `verifying` / `installing` / `uninstalling` / `done` / `failed`；`total` 为索引里的包大小（读到索引前为 0）；下载阶段最多每 200ms 推一次；`error` 仅 failed 时为错误码。没有沿用 `plugins-changed`：岛屿窗口也监听它并重读快照，高频进度会带着整个岛屿重渲染。同一插件已有安装或卸载任务时，`install_plugin` / `uninstall_plugin` 立即返回错误 `plugin_install_in_progress`。下载临时文件为应用数据目录 `plugins/.download-<id>.zip`，结束即删。
- 取消安装（2026-11-26）：新增命令 `cancel_plugin_install(id) -> bool`。只在 `downloading` / `verifying` 阶段接受并返回 `true`；进入 `installing`、正在卸载或没有任务时返回 `false`（解压和替换很短且可回滚，不中途打断）。接受后 `install_plugin` 返回错误码 `plugin_install_cancelled`，删除下载临时文件，不建 staging 目录，已安装的旧版本不动。`plugin-install-progress` 新增 `phase: "cancelled"`：发一次后任务从列表移除，不算失败、可以马上重装。单列一个 phase 而不沿用 `done`，是为了别的窗口不把它当成装好了。
- 事件：`plugins-changed`（无敏感数据；前端重新 get_plugins）。stdio RPC：`initialize`、`action`、`publish`，停止时可发送无 id 的可选 `shutdown` 通知；旧 v1 插件仍由宿主限时结束，完整 schema 见 `docs/plugins/api.md`。
- 面板页（2026-11-16 新增，向后兼容）：manifest 可声明 `permissions/contributes` 的 `panel` 与 `panel.icon`（`battery`、`heart-pulse`、`activity`、`timer`、`gauge`、`puzzle`）；`publish` 多一个可缺省的 `panel`（`headline`、`note`、最多 16 行 `rows`、最多 4 个 manifest 已声明动作 id、可选的 `islandActions`（`actions` 子集，岛内页面只显示这些，省略或 null 显示全部）、`attention`），行含 `percent`（0–100）与 `countdownTo`（Unix 毫秒，宿主本地倒数），两者可同时给出（期限配一条剩余比例）。`get_plugins()` 的 `live.<id>` 相应多 `panel`（可为 null）。没有声明的旧插件不受影响；不认识的 `panel` 字段或动作会让该次 publish 被拒。宿主只在快照确实变化时发 `plugins-changed`，重复 publish 不再触发前端重读。
- manifest：`fly-island-plugin.json`；发布索引：`plugins-index.json`。现有命令、事件、窗口、localStorage key、latest.json 格式和更新端点保持兼容。
- 官方索引移至 `releases/download/plugins-channel/plugins-index.json`。`get_plugins_index`、`install_plugin` 和 `set_plugin_enabled` 的参数及返回类型不变；插件市场识别错误字符串 `plugin_index_unavailable`、`plugin_index_incompatible`、`plugin_not_listed`、`plugin_package_download_failed`、`plugin_package_integrity_failed`、`plugin_package_invalid`、`plugin_install_failed`、`plugin_start_failed`，不显示原始诊断。2026-11-26 起下载与卸载细分新增 `plugin_download_timeout`、`plugin_download_interrupted`、`plugin_download_http_client`、`plugin_download_http_server`、`plugin_disk_full`、`plugin_install_in_progress`、`plugin_uninstall_failed`；`plugin_package_download_failed` 保留给其他下载失败（如连不上）。卸载失败时 `uninstall_plugin` 的返回值仍是原始原因，进度事件里的 `error` 为 `plugin_uninstall_failed`。
- v3.2.6（2026-11-18，第三轮手测后）：`fly-island-settings` 兼容新增 `todoVisibleRows`（整数 3–12，默认 8，即默认面板高度上限原本就放得下的行数，老用户观感不变）。新增命令 `add_file_shelf_welcome(fileName, content)`：首次启动时把欢迎说明写到应用数据目录 `welcome/<fileName>.txt` 并放进文件中转。首次启动（从未保存过设置和待办）时待办列表带一条欢迎待办，按普通待办保存在 `fly-island-todos`。

## 时间与天气命令（2026-11-20）

- `search_weather_cities({ name, language }) → { name, latitude, longitude }[]`：name 为去空白后 2–100 字符的城市名，language 为 `zh` 或 `en`（其它值按 en）；最多八项，按行政级别与人口排序，过滤低质量同名点，显示名合并城市、行政区、国家并去重；Open-Meteo 结果质量不足时用 Nominatim 补充一项。
- `locate_weather({ language }) → { location: { name, latitude, longitude }, source: "windows" | "ip" }`：只在用户点击时同时请求 Windows Geolocator 和 `ipwho.is` 网络粗定位；Windows 有坐标时用 Nominatim 反向解析城市，否则用 `ipwho.is` 返回的本地化城市名。坐标不写入 Rust 文件或独立位置记录，错误由前端显示可操作提示。
- `get_current_weather({ latitude, longitude }) → { temperature, code, observedAt, fetchedAt }`：校验地理坐标；temperature 为摄氏数值，code 为 WMO weather_code，两个时间均为 Unix 毫秒。天气与地理编码命令异步请求固定 HTTPS 服务，不新增事件、Tauri 权限或原生持久化文件。

- 护眼插件（2026-11-17）：id `eye-care`，runtime `eye-care.exe`，permissions `panel` / `desktop-windows`，panel icon `heart-pulse`；设置 key `period`（分钟字符串）、`rest-minutes`（整数分钟字符串，1–60）、`idle`（分钟字符串）、`allow-skip`（布尔）、`pause-fullscreen`（布尔，默认 true，2026-11-26 新增）、`language`（`zh-CN` / `en`）；动作 `rest_now`。升级时将旧 `rest` 秒数（包括旧清单默认值）换算为分钟后向上取整，旧小数分钟同样向上取整为至少 1 分钟；插件兼容读取旧 key，新 key 优先。三个时长以 manifest 的 `number` 类型（必填 min / max，保存值仍是字符串）声明并自动保存，其他设置类型不变。复用 API v1；既有宿主命令、事件和 Tauri 窗口 label 保持兼容，0.2.0 的新增窗口契约见下文。

## 护眼宿主窗口（0.2.0，2026-11-19）

- 新增按需窗口标签 `eye-care-rest-<serial>-<screen>` 与页面入口 `?window=eye-care`；不改旧的四个窗口。
- 新增命令 `get_eye_care_break()`、`show_eye_care_break_window()`，仅操作已登记的休息窗口；事件 `eye-care-break-changed` 为可空的 `{deadline, canSnooze, canSkip, percent, language}`（`percent` 为 0–100 的剩余比例，取自面板 timer 行，插件未上报时为 `null`，2026-11-26 新增）。独立 capability 只允许休息窗口监听/取消监听事件，不授予 opener/updater。
- 插件 id、既有设置 key 与计时迁移不变，manifest 新增 `snooze_5/10/15/20/25/30` 和 `skip` 动作；状态机仍校验阶段、一次推迟和跳过权限。`rest_now` 保留。
- 新宿主仅为该受支持清单的初始化 settings 注入保留键 `_host-eye-care-windows: true`；该键不写入注册文件，也不是用户设置。旧宿主缺少标记时，0.2.0 显示升级说明，不假装已覆盖显示器；旧插件清单不会触发宿主窗口，避免双重遮罩。


- 设备电量与音频使用固定插件 id device-battery。命令 device_battery_read(progress?)、device_battery_audio(speakerId, headsetId, target?) 仅对已启用的市场包生效，调用端不提供可执行文件路径。音频绑定存放于 fly-island-device-battery 的 speakerId / headsetId。宿主要求包内有 device-battery-bridge.exe、engine/runtime/python.exe、engine/server.py；0.2.0 起 python.exe 是 Rust 引擎、server.py 是占位文件。宿主以 `-I -B <server.py>` 启动引擎（引擎忽略这些参数），向标准输入写一行 poll 命令，读取至多 96 行 complete:false 与一行 complete:true 的 schema 2 JSON。
- 日历标记使用现有 fly-island-native-plugins / fly-island-native-plugins-disabled 的 calendarMarks id。
- CodeBuddy 会话来源（插件市场可选安装，作者 yiumanlenong）：`list_agent_sessions` 的 `native` 新增 `"codebuddy"`，返回的 `provider` 新增 `codebuddy`；`focus_agent_window` 沿用现有命令，对 `codebuddy` 通过 `~/.codebuddy/sessions` 登记的进程找终端窗口。只读 `~/.codebuddy/projects`、`~/.codebuddy/sessions`，拒绝重解析点与超大文件，最多两秒读一次，未安装或开关关闭时不读取。`fly-island-settings` 兼容新增 `agentShowCodeBuddy`（缺失时为 true，仅在装了插件时生效）。无新增命令、事件或 localStorage key。
- 剪贴板文件图标（新增只读命令）：`read_clipboard_history_file_icon({ id: string })` 返回该记录第一个文件的 Explorer 图标（PNG data URL），文件不存在、记录没有文件或系统没有图标时返回 `null`；图标不写入 `clipboard-history.json`，缓存与文件中转共用 `file_icons.rs`。无新增事件、localStorage key 或设置字段。

### 可丢弃的 Antigravity 额度缓存

`app_cache_dir()/antigravity-quota.json` 使用版本 1：`{ version: 1, updatedAt: <Unix ms>, plan: <string|null>, models: [{ name: <string>, used: <0–100>, resetsAt: <Unix ms|null> }] }`。文件不含凭据，不参与配置迁移；缺失、损坏、版本不支持或超过 7 天时忽略，成功查询后原子重建。不改变 `get_antigravity_usage` 的前端调用方式或返回格式。

Antigravity 额度缓存升级为版本 2，在原字段外增加 `fiveHour`、`sevenDay`（窗口对象或 null）。兼容读取版本 1 的模型数据，但不将它们转换成 5 小时／每周；成功查询后原子写入版本 2，损坏或过期缓存仍忽略。

### 社区插件维护者接入

- 安装 id 新增 `centeredClock`、`relay`、`appleMusicLyrics`、`screenshot`，均复用内置插件安装/停用清单，缺失表示未安装，不迁移旧用户为自动安装。
- 中转站命令：`get_relay_accounts`、`save_relay_account({ input })`（探测成功并保存刷新后的令牌才返回遮罩列表）、`delete_relay_account({ id })`、`get_relay_usage`。账号字段见 `features/agent-status/api.ts`，读取不返回原始凭据；`userId` 可编辑且回传保留。并发保存变更返回 `relay:account:changed`，不覆盖新版本。
- 歌词 `get_lyrics` 兼容新增 `query.appleMusic`（默认 false）；命令 `set_apple_music_token({ token })`、`clear_apple_music_token`、`has_apple_music_token`；事件 `apple-music-token-changed` 不携带令牌。
- 截图窗口 `screenshot` 与动态前缀 `pinned-image-*` / `screenshot-translation-*` / `screenshot-ocr-*` 复用 `?window=` 分发及对应 capability。截图帧和选区使用屏幕物理像素，贴图 origin 使用 CSS 像素；事件 `screenshot-arm` 唤醒覆盖层，`pin-menu-action` 向目标窗口发送原生菜单动作。
- 截图 IPC（参数与返回类型集中在 `features/screenshot/api.ts`）：`configure_screenshot_plugin`, `install_screenshot_ocr`, `screenshot_activate`, `screenshot_capabilities`, `screenshot_capture`, `screenshot_copy`, `screenshot_copy_document`, `screenshot_copy_png`, `screenshot_copy_text`, `screenshot_dismiss`, `screenshot_fonts`, `screenshot_ocr`, `screenshot_ocr_installed`, `screenshot_ocr_lines`, `screenshot_open`, `screenshot_pin_close`, `screenshot_pin_copy_image`, `screenshot_pin_destroy`, `screenshot_pin_image`, `screenshot_pin_menu`, `screenshot_pin_ocr_lines`, `screenshot_pin_reveal`, `screenshot_pin_save_image`, `screenshot_pin_translate`, `screenshot_pinned_src`, `screenshot_raw`, `screenshot_ready`, `screenshot_save_png`, `screenshot_save_png_to`, `screenshot_start_task`, `screenshot_trace`, `screenshot_window_rect`, `screenshot_windows`, `set_screenshot_shortcut`。`configure_screenshot_plugin` 只启停已安装插件的热键/窗口；OCR 下载只由 `install_screenshot_ocr` 显式触发。
