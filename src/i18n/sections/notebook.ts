export type NotebookText = {
  sectionLabel: string;
  backToToday: string;
  saveTodayMarkdown: string;
  reviewSaved: string;
  tasksTab: string;
  dailyTab: string;
  reviewTab: string;
  openDailyNote: string;
  backToTasks: string;
  notebookCards: string;
  twoColumnTimeline: string;
  openCount: (count: number) => string;
  addTaskFor: (date: string) => string;
  reviewTodos: string;
  addTaskHint: string;
  dailyPlaceholder: string;
  dailyNoteLabel: string;
  pickDate: string;
  dateToday: string;
  dateTomorrow: string;
  upcomingTab: string;
  showUpcoming: (count: number) => string;
  scheduledCount: (count: number) => string;
  noScheduled: string;
  deleteScheduled: (title: string) => string;
  historyTab: string;
  openHistory: string;
  noHistory: string;
  historyDays: (count: number) => string;
  doneOf: (done: number, total: number) => string;
  restoreTodo: (title: string) => string;
  alreadyToday: string;
  calendarTab: string;
  openCalendar: string;
  previousMonth: string;
  nextMonth: string;
  thisMonth: string;
  dayTodos: (date: string, count: number) => string;
  noTodosOnDay: string;
};

export const zhCN: NotebookText = {
  sectionLabel: "任务清单",
  backToToday: "回到今天的待办",
  saveTodayMarkdown: "把今天的待办保存为 Markdown",
  reviewSaved: "查看保存过的待办",
  tasksTab: "待办",
  dailyTab: "笔记",
  reviewTab: "回顾",
  openDailyNote: "打开今日笔记",
  backToTasks: "回到待办",
  notebookCards: "笔记本卡片",
  twoColumnTimeline: "双栏时间线",
  openCount: (count) => `${count} 项未完成`,
  addTaskFor: (date) => `添加 ${date} 的待办`,
  reviewTodos: "回顾你的待办",
  addTaskHint: "添加待办，按 Enter 保存",
  dailyPlaceholder: "写下今天的笔记…",
  dailyNoteLabel: "今日笔记",
  pickDate: "选择日期",
  dateToday: "今天",
  dateTomorrow: "明天",
  upcomingTab: "已安排",
  showUpcoming: (count) => `查看 ${count} 项已安排的待办`,
  scheduledCount: (count) => `${count} 项已安排`,
  noScheduled: "以后还没有安排",
  deleteScheduled: (title) => `删除已安排的待办：${title}`,
  historyTab: "历史",
  openHistory: "查看以前的待办",
  noHistory: "还没有以前的待办",
  historyDays: (count) => `${count} 天`,
  doneOf: (done, total) => `完成 ${done}/${total}`,
  restoreTodo: (title) => `把“${title}”加到今天`,
  alreadyToday: "已在今天的列表里",
  calendarTab: "日历",
  openCalendar: "打开日历",
  previousMonth: "上个月",
  nextMonth: "下个月",
  thisMonth: "回到本月",
  dayTodos: (date, count) => (count > 0 ? `${date}，${count} 项待办` : date),
  noTodosOnDay: "这天没有待办",
};

export const en: NotebookText = {
  sectionLabel: "Tasks",
  backToToday: "Back to today's todo list",
  saveTodayMarkdown: "Save today's todo list as markdown",
  reviewSaved: "Review saved todo lists",
  tasksTab: "Tasks",
  dailyTab: "DAILY",
  reviewTab: "Review",
  openDailyNote: "Open daily note",
  backToTasks: "Back to tasks",
  notebookCards: "Notebook cards",
  twoColumnTimeline: "Two-column timeline",
  openCount: (count) => `${count} open`,
  addTaskFor: (date) => `Add a task for ${date}`,
  reviewTodos: "Review your todos",
  addTaskHint: "Add a task, press Enter to save",
  dailyPlaceholder: "Write today's notes...",
  dailyNoteLabel: "Daily note",
  pickDate: "Pick a date",
  dateToday: "Today",
  dateTomorrow: "Tomorrow",
  upcomingTab: "Upcoming",
  showUpcoming: (count) => `Show ${count} scheduled ${count === 1 ? "task" : "tasks"}`,
  scheduledCount: (count) => `${count} scheduled`,
  noScheduled: "Nothing scheduled for later",
  deleteScheduled: (title) => `Delete scheduled task: ${title}`,
  historyTab: "History",
  openHistory: "Show past todos",
  noHistory: "No past todos yet",
  historyDays: (count) => `${count} ${count === 1 ? "day" : "days"}`,
  doneOf: (done, total) => `${done}/${total} done`,
  restoreTodo: (title) => `Add "${title}" to today`,
  alreadyToday: "Already on today's list",
  calendarTab: "Calendar",
  openCalendar: "Open calendar",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  thisMonth: "Back to this month",
  dayTodos: (date, count) => (count > 0 ? `${date}, ${count} ${count === 1 ? "task" : "tasks"}` : date),
  noTodosOnDay: "No tasks on this day",
};
