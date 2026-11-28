export type CenteredClockText = {
  showTime: string; showDate: string; showSeconds: string; hourCycle: string; hour24: string; hour12: string;
  showWeekday: string; dateFormat: string; dateTokens: string; dateFirst: string; preview: string; footer: string;
  timeLabel: (value: string) => string;
};

export const zhCN: CenteredClockText = {
  showTime: "显示时间", showDate: "显示日期", showSeconds: "显示秒", hourCycle: "时间制式", hour24: "24 小时制", hour12: "12 小时制",
  showWeekday: "显示星期", dateFormat: "日期格式", dateTokens: "格式符：YYYY 年、MM 月、DD 日、ddd 短星期；分隔符会原样保留。",
  dateFirst: "日期显示在时间前", preview: "预览",
  footer: "时钟空闲时居中显示；有消息预览、Agent 会话、歌词或待办计时器时，按展示优先级让位。卸载后偏好与排序会保留。",
  timeLabel: (value) => `当前时间 ${value}`,
};

export const en: CenteredClockText = {
  showTime: "Show time", showDate: "Show date", showSeconds: "Show seconds", hourCycle: "Time format", hour24: "24-hour", hour12: "12-hour",
  showWeekday: "Show weekday", dateFormat: "Date format", dateTokens: "Tokens: YYYY year, MM month, DD day, ddd short weekday. Separators are kept as typed.",
  dateFirst: "Show date before time", preview: "Preview",
  footer: "The clock stays centered while idle. Message previews, Agent sessions, lyrics and timed todos take priority. Preferences and order are kept if uninstalled.",
  timeLabel: (value) => `Current time ${value}`,
};
