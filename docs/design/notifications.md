# 通知阅读与选中

全局方向见 [DESIGN.md](../../DESIGN.md)。本次在现有岛屿中增加阅读与提醒流程，沿用系统字体、语义颜色、紧凑控件和岛屿弹簧过渡。（用户要求，2026-11-18）

- 设置 → 消息 → 岛上通知的“长消息自适应展开”默认关闭。开启后短消息保留单行，稍长消息先加宽，达到最大宽度后改为换行阅读；宽高受用户上限和缩放后的舞台边界共同约束。最大宽度 320–720、默认 520px；最大高度 80–360、默认 180px；独立停留时间 3–60、默认 12 秒。正文超出高度后滚动，不压小文字。（用户需求；数值为 Agent 实现决定） 一行能否放下以收起条实际排版为准：估算之外再量一次文字被截掉的宽度（旁边的状态图标、实际字宽都算在内），仍被截断就继续加宽，超过最大宽度改为换行阅读。（用户手测发现开启后长消息不撑大岛屿，原因是只按估算判断，2026-11-18）
- 自适应邮件通知始终使用阅读布局，主题和按需读取的正文完整换行。来源图标是拖动柄，发件人和正文可用鼠标拖选、Ctrl+C 复制；按下文字既不拖窗口也不打开邮件，打开是独立按钮。不放“复制全文”按钮（用户手测后要求 2026-11-18：不加多余按钮）。正文加载时显示进度文案，失败原地重试。读取通知正文不标记已读、不打开面板。鼠标停在岛上时通知保持显示，不按秒数收走，移开后再收；保持期间不会因悬停展开而打开页面。（用户需求；加载状态与悬停保持为 Agent 实现决定）
- 邮件面板的主题、发件人与正文可选中，用选中文字复制，不另加复制按钮。选择文字和选中链接文字不会触发打开或拖动；已有选区时保留原生右键复制菜单。（issue #83；Agent 实现决定）
- 通知外形进入使用现有展开弹簧，结束沿用收起过渡；阅读正文短暂淡入。减少动态效果时关闭正文入场，保留岛屿外形过渡的既有约定。（Agent 实现决定）
- 设置 → 通用 → 展开与收起，在游戏模式旁放置“游戏模式下仍弹出通知”，默认关闭；开启后显示 2–30 秒的独立时长，默认 4 秒。quiet 状态下的通知可以从贴边短暂露出，覆盖普通通知的贴边露出偏好。只展示，不获取焦点，整块命中区保持原生点击穿透；到期撤去并沿用贴边回收。游戏模式本身的 quiet、焦点和顶沿策略由游戏模式模块负责。（用户要求；默认秒数为 Agent 实现决定）

English: Adaptive notices are opt-in. They widen before wrapping, then scroll within user limits and the scaled native stage. Mail notices fetch the visible message body on demand, offer selectable text (Ctrl+C) and a separate open action, stay while the cursor is on them, and never mark the message read. Whether a message fits one line is measured on the laid-out bar, not only estimated. Game notices have their own opt-in and duration, display without taking focus, and keep native click-through enabled.
