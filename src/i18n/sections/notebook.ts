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
};

export const zhCN: NotebookText = {
  sectionLabel: "任务清单",
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
};
