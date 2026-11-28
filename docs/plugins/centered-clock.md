# 居中时钟 / Centered Clock

居中时钟是内置的可选岛屿插件。安装后，收起的岛屿在没有更高优先级内容时，将时间（可选日期）显示在正中央；Agent 会话、歌词、活动待办与计时器按外观设置中的展示优先级覆盖它。关闭或卸载时不删除格式偏好或优先级位置。

设置包括显示时间/日期、秒、12/24 小时制、星期、日期格式与排列预览。日期格式支持 `YYYY`、`MM`、`DD`、`ddd`，其他分隔符原样显示。时钟在分钟或秒边界刷新；不需要网络、Rust 命令或文件访问。

安装记录使用既有 `fly-island-native-plugins` 的 `centeredClock` id；偏好单独保存在 `fly-island-centered-clock`。若同时安装时间与天气插件，居中时钟启用显示时会暂时代替原时间位，天气保持可用，卸载后原时间位和开关恢复。

Centered Clock is an optional built-in island plugin. When the collapsed island has no higher-priority activity, it shows the time (and optionally the date) at the center. Agent sessions, lyrics, active todos and timers take precedence according to Appearance settings. Disabling or uninstalling the plugin keeps its format preferences and priority position.

Options cover time/date, seconds, 12/24-hour format, weekday, date format and a live preview. Date formats support `YYYY`, `MM`, `DD` and `ddd`; separators are literal. The display refreshes on minute or second boundaries and needs no network, Rust command or file access.

Installation uses the existing `fly-island-native-plugins` list with id `centeredClock`; preferences use `fly-island-centered-clock`. With Clock & Weather also installed, the centered clock temporarily replaces its time slot while enabled; weather remains available, and removing Centered Clock restores the original clock and switch.
