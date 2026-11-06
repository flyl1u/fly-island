export type CalendarText = {
  title: string;
  today: string;
  tomorrow: string;
  allDay: string;
  untitled: string;
  nothing: string;
  join: string;
  joinLabel: (title: string) => string;
  refresh: string;
  openSettings: string;
  updatedAt: (time: string) => string;
  problems: (count: number) => string;
  /** The collapsed island's countdown. */
  meeting: string;
  inMinutes: (minutes: number) => string;
  started: string;
};

export const zhCN: CalendarText = {
  title: "日历",
  today: "今天",
  tomorrow: "明天",
  allDay: "全天",
  untitled: "（无标题）",
  nothing: "没有日程",
  join: "加入",
  joinLabel: (title) => `加入「${title}」的会议`,
  refresh: "重新读取日历",
  openSettings: "日历设置",
  updatedAt: (time) => `${time} 更新`,
  problems: (count) => `${count} 个日历没读到，到设置里看看`,
  meeting: "会议",
  inMinutes: (minutes) => `${minutes} 分钟后`,
  started: "已开始",
};

export const en: CalendarText = {
  title: "Calendar",
  today: "Today",
  tomorrow: "Tomorrow",
  allDay: "All day",
  untitled: "(No title)",
  nothing: "Nothing scheduled",
  join: "Join",
  joinLabel: (title) => `Join the meeting "${title}"`,
  refresh: "Read the calendars again",
  openSettings: "Calendar settings",
  updatedAt: (time) => `Updated ${time}`,
  problems: (count) => (count === 1 ? "1 calendar could not be read; see Settings" : `${count} calendars could not be read; see Settings`),
  meeting: "Meeting",
  inMinutes: (minutes) => (minutes === 1 ? "in 1 min" : `in ${minutes} min`),
  started: "started",
};
