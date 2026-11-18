# 融入小岛的设计规范 / Island design integration

[总览 / Overview](README.md) · [API](api.md) · [提交 / Contributing](contributing.md)

插件是小岛的一部分，用户不应学习另一套界面。数据与用户动作由插件提供，布局、颜色、状态、控件、焦点和动效由宿主组件负责。以下是贡献审核标准；不能用独立网页、弹窗、置顶窗口或自绘通知绕过现有扩展点。用户点击的必要登录浏览器是已声明流程，不是常驻插件 UI。

A plugin should feel like part of the island without a second interface to learn. Supply data and user actions; host components own layout, colors, states, controls, focus and motion. These are contribution review criteria. Do not bypass extension points with a web UI, popup, always-on-top window or custom notification. A necessary, declared browser sign-in started by a user is a workflow, not a persistent plugin UI.

## 遵循已有组件 / Follow existing components

全局依据 [DESIGN.md](../../DESIGN.md)，具体依据[岛屿规范](../design/island.md)、[设置规范](../design/settings.md)、[Agent 规范](../design/agent.md)。数值与实际表现以组件和 tokens.css 为准；插件不发送 CSS、颜色、字号、圆角、宽高或动画参数。

Use the global DESIGN.md and the linked island, settings and agent guidelines. Components and tokens.css define actual values and behavior. Plugins cannot send CSS, colors, typography, radii, dimensions or animation parameters.

| 数据 / Data | 宿主呈现 / Host presentation | 开发者负责 / Plugin responsibility |
| --- | --- | --- |
| manifest settings/actions | SettingsGroup、SettingsRow、开关/输入/选择/文字按钮 / Host groups, rows, toggle/input/select/link buttons | 只留必要选项、正确默认值、简短双语标题；别模拟设置页 / Necessary options, valid defaults and short bilingual labels |
| quota | Agent 顶部 QuotaRings 与 IslandHoverCard / Rings and hover/keyboard card above sessions | 剩余值、币种单位、真实重置时间与未知状态 / Remaining values, units, real reset time and unknowns |
| sessions | 原会话列表/卡片/紧凑模式、标题与折叠计数 / Existing session views, title and collapsed count | 稳定 id、真实状态、时间和可识别标题 / Stable ID, accurate state/time and recognizable title |
| notifications | MessageCard、插件消息分页、折叠预览 / MessageCard, plugin tab and collapsed preview | 简短摘要、稳定事件时间、去重、合并和有限数量 / Short summaries, stable timestamps, deduplication, coalescing and bounded history |

不能要求用户安装另一套前端组件、字体或图标包。宿主支持明暗配色、用户字号和窄窗口；插件不能用 ASCII 图、空格对齐、emoji 排版或长串装饰来规避布局。不将 API 上限 4096 字节当作文案长度目标。

Do not require separate frontend components, fonts or icon packs. The host supports light/dark themes, user font sizes and narrow windows. Do not use ASCII art, padding spaces, emoji layouts or decorative strings as layout substitutes. The 4096-byte API limit is not a copy-length target.

## 文案与语言 / Copy and localization

- 清单的 name、description、每个设置/选项/动作 label 都必须同时提供 zh-CN 和 en。名称说清服务或用途；动作使用「去登录」「刷新」这类短动词，不用「点击这里」、技术内部名或营销话术。/ Provide zh-CN and en for names, descriptions and every setting/option/action label. Name the service or purpose; use short actions such as “Sign in” and “Refresh,” not “Click here,” internal identifiers or promotional claims.
- 陈述事实与下一步：「暂时读不到额度，请稍后重试」，不要把网络失败说成「额度用完」；不指责用户，不刷屏显示堆栈或服务器响应正文。宿主可能仅显示通用 action 错误，因此不能依赖自定义 error.message 作为唯一操作指引。/ State facts and a next step, e.g. “Quota is unavailable. Try again later.” Do not equate network failure with exhausted quota, blame users or expose stack traces/response bodies. The host may show only a generic action error, so error.message cannot be your only guidance.
- 用户原文（会话标题、消息内容、目录）原样保留；短产品名和品牌名不强行翻译。数值带有必要单位；不知道的值用 null，不伪造 0、未读数或成功状态。/ Preserve user session titles, message text and paths. Keep brand names intact, include necessary units, and use null for unknown values rather than inventing zeros, unread counts or success.

**v1 的语言限制：** manifest 元数据由宿主按当前语言选择；publish 的 label/title/body/appName 都是单字符串，initialize 不携带 locale。当前会话来源名使用 name.en。需要插件生成不同语言文案时，可用一个已声明的双语 select 设置（如 language=zh-CN/en），初始化后由插件选择；不要添加未支持的 locale 字段，也不要宣称会自动跟随宿主。若短中性服务名足够就优先用它；运行时用户原文不要求双语拼接。PR 必须分别检查宿主中文和英文下的结果，并说明动态文案语言策略。

**v1 language limitation:** The host selects manifest metadata by locale. Published label/title/body/appName are single strings, and initialize has no locale. Session source names currently use name.en. If generated copy needs a language choice, declare a bilingual select setting such as language=zh-CN/en and apply it during initialization. Do not add unsupported locale fields or claim automatic host-language following. Prefer a short neutral service name where sufficient; do not concatenate translations into user-authored text. Check both host languages and describe your runtime language strategy in the PR.

## 图标与视觉状态 / Icons and visual states

v1 不提供自定义图标上传或图像 URL。插件会话使用宿主的通用插件来源图标；消息 icon 仅有 plugin/wework/dingtalk/feishu 的宿主映射，其他值回退 Puzzle。三家企业 IM 是字母色块，不是插件附带的品牌资产。不要冒充内置来源或未经许可附带品牌图。

v1 offers no custom-icon uploads or image URLs. Sessions use the host's generic plugin-provider icon. Messages map plugin/wework/dingtalk/feishu to host icons, with Puzzle as fallback. Enterprise IM uses letter badges, not plugin-bundled brand assets. Never impersonate a built-in provider or bundle unlicensed brand artwork.

新增宿主 UI（需单独讨论）继续用 lucide-react、语义颜色 token、现有字体/圆角和组件。图标规范参见岛屿文档（16/14px，1.5 描边）；颜色只表达数据/状态，不给插件制造第二套主题。错误、等待、运行、完成沿用宿主灯色，不在 title 中塞彩色方块或状态 emoji。

Any separately agreed host UI work must reuse lucide-react, semantic color tokens, existing fonts/radii and components. Follow island icon sizing (16/14px, 1.5 stroke). Colors express data/state, not a separate plugin theme. Let host lights express error/waiting/running/completed instead of inserting colored squares or status emoji into titles.

## 额度、会话与消息 / Quota, sessions and messages

额度一律传**剩余**百分比，外内环含义需在 PR/插件说明中讲清。按量钱包没有可靠分母时显示余额，不捏造百分比；未知百分比为 null，空 balance 用 null。传真实重置时间，过期后更新而非等宿主抹去旧数据。当前 hover card 只支持 API 列出的内容，不能附加营销说明或完整账单。

Send **remaining** percentages and explain outer/inner meanings in the PR/plugin notes. For metered wallets without a reliable denominator use balance rather than invented percentages. Unknown percentages and absent balances are null. Refresh expired reset data yourself. Hover cards support only documented data, not promotions or full billing statements.

会话 title 用简短可识别任务名；项目路径放 cwd，不把完整 transcript 塞进标题。running 表示确实运行，waiting 表示确实等待用户，completed 表示该轮已结束；不能用 v1 没有的 failed 字段。时间用实际会话事件或文件修改时间，保留稳定身份，使排序、已读、归档和提示去重正常。action 仅在用户点击后打开该会话或聚焦相应程序，不自动抢焦点。

Use concise recognizable session titles and cwd for paths, never full transcripts. running means actual work, waiting actual user input, and completed an ended turn; v1 has no failed field. Use real event/file timestamps and stable identity so sorting, read/archive state and reminder deduplication work. Actions navigate/focus only after user clicks, never automatically.

消息 title 是会话名或短主题，body 是纯文本摘要，不带 HTML/Markdown 布局或超长 URL。尊重通知隐私：只读到「有新提醒」就发送这一事实，不猜联系人、正文或精确未读数。sourceId 区分插件内来源，id 区分真实事件。

Message titles identify a conversation/topic, and bodies are plain-text summaries without HTML/Markdown layout or long URLs. Respect notification privacy: if all you know is “New alert,” report that fact rather than guessing contacts, contents or exact unread counts. sourceId identifies the source and id the real event.

## 不打扰用户 / Quiet behavior

以下由插件采集策略和宿主现有提醒逻辑共同实现；v1 **没有游戏模式回调，也没有插件自行弹岛/播放音效 API**。宿主的游戏免打扰、通知仲裁、Agent 提示设置继续掌握展示，插件不另开通知窗口、系统 Toast 或播放声音绕过它。

Quiet behavior combines plugin collection policy with host presentation. v1 **has no game-mode callback or plugin API to expand the island/play sounds**. Host game DND, preview arbitration and agent preferences remain in control; do not bypass them with custom windows, OS toasts or audio.

- 只在真实新事件产生消息，不在每次 poll、重连、启动时把历史重新通知。旧消息保留 id/receivedAt；无需一直留的从下次完整快照移除。/ Publish alerts for real new events, not every poll/reconnect/startup. Keep old IDs/times; remove unnecessary history from subsequent snapshots.
- 同一来源突发消息应合并；默认以同来源 **10 秒内最多一次新摘要**作为审核建议，超出须说明必要性和限流策略。这是防打扰审核要求，不是宿主已实现的统一限额。/ Coalesce bursts per source. The review recommendation is **at most one new summary per source per 10 seconds**; justify exceptions and throttling. This is review policy, not a host-enforced universal limit.
- 额度正常刷新不作为通知；登录失败或网络中断不反复生成新消息。真正的耗尽/恢复等状态只在转换时提醒，不在每轮重复。/ Routine quota refresh is not a notification; sign-in/network errors must not create repeated messages. Alert only on meaningful transitions such as exhaustion/recovery.
- 游戏/全屏、用户正在使用展开岛、托盘隐藏等场景按宿主既有逻辑走，不伪造时间戳强行重现预览，不在用户回到桌面后补播积压的提示。/ Honor host behavior during full-screen/game DND, active island use and tray hiding. Do not force previews with fresh timestamps or replay an alert backlog on return.
- 关闭插件即停止采集与后台任务；没有自动唤起登录、置顶、修改小岛窗口、强制切页或周期抢焦点。/ Disabling ends collection/background work. No automatic sign-in windows, always-on-top changes, host-window manipulation, forced navigation or periodic focus stealing.

## 录屏应检查的状态 / States to verify on video

在真实小岛演示启用、真实数据、用户点击动作、停用；另外自测明暗配色、中英文、独立设置窗口最小 560×420 与岛内设置、长标题/路径、无账号/离线、游戏模式与进程退出。确认文字换行、不撑宽，不新增重复导航或无意义的设置。录屏须遮住账号、路径中敏感部分、凭据和第三方私人消息。

Record enabling, real data, user actions and disabling inside the actual island. Also self-test light/dark, both languages, the minimum 560×420 settings window and embedded settings, long titles/paths, unsigned-in/offline behavior, game DND and process exit. Check wrapping without horizontal overflow or duplicate navigation/settings. Redact accounts, sensitive paths, credentials and private third-party messages.
