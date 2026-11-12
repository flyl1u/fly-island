export type NotebookText = {
  sectionLabel: string;
  backToToday: string;
  saveTodayMarkdown: string;
  reviewSaved: string;
  tasksTab: string;
  dailyTab: string;
  openDailyNote: string;
  backToTasks: string;
  progress: string;
  addTaskFor: (date: string) => string;
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
  dayToday: string;
  dayYesterday: string;
  dayTomorrow: string;
  /** A day as a short heading: 11月9日 周一 / Mon, Nov 9. */
  formatDay: (date: Date) => string;
  moveToToday: string;
  addTodo: string;
  doneOf: (done: number, total: number) => string;
  restoreTodo: (title: string) => string;
  alreadyToday: string;
  calendarTab: string;
  previousMonth: string;
  nextMonth: string;
  calendarGoToToday: string;
  dayTodos: (date: string, count: number) => string;
  noTodosOnDay: string;
};

const zhTaskCount = (count: number) => `${count} 项待办`;
const enTaskCount = (count: number) => `${count} ${count === 1 ? "task" : "tasks"}`;

export const zhCN: NotebookText = {
  sectionLabel: "任务清单",
  backToToday: "回到今天的待办",
  saveTodayMarkdown: "把今天的待办保存为 Markdown",
  reviewSaved: "查看保存过的待办",
  tasksTab: "待办",
  dailyTab: "笔记",
  openDailyNote: "打开今日笔记",
  backToTasks: "回到待办",
  progress: "待办进度",
  addTaskFor: (date) => `添加 ${date} 的待办`,
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
  dayToday: "今天",
  dayYesterday: "昨天",
  dayTomorrow: "明天",
  formatDay: (date) => `${date.getMonth() + 1}月${date.getDate()}日 ${"周日周一周二周三周四周五周六".slice(date.getDay() * 2, date.getDay() * 2 + 2)}`,
  moveToToday: "移到今天",
  addTodo: "添加待办",
  doneOf: (done, total) => `${done}/${total} 已完成`,
  restoreTodo: (title) => `把“${title}”加到今天`,
  alreadyToday: "已在今天的列表里",
  calendarTab: "日历",
  previousMonth: "上个月",
  nextMonth: "下个月",
  calendarGoToToday: "回到今天",
  dayTodos: (date, count) => (count > 0 ? `${date}，${zhTaskCount(count)}` : date),
  noTodosOnDay: "这天没有待办",
};

export const en: NotebookText = {
  sectionLabel: "Tasks",
  backToToday: "Back to today's todo list",
  saveTodayMarkdown: "Save today's todo list as markdown",
  reviewSaved: "Review saved todo lists",
  tasksTab: "Tasks",
  dailyTab: "Notes",
  openDailyNote: "Open daily note",
  backToTasks: "Back to tasks",
  progress: "Task progress",
  addTaskFor: (date) => `Add a task for ${date}`,
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
  dayToday: "Today",
  dayYesterday: "Yesterday",
  dayTomorrow: "Tomorrow",
  formatDay: (date) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date),
  moveToToday: "Move to today",
  addTodo: "Add todo",
  doneOf: (done, total) => `${done}/${total} done`,
  restoreTodo: (title) => `Add "${title}" to today`,
  alreadyToday: "Already on today's list",
  calendarTab: "Calendar",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  calendarGoToToday: "Back to today",
  dayTodos: (date, count) => (count > 0 ? `${date}, ${enTaskCount(count)}` : date),
  noTodosOnDay: "No tasks on this day",
};
