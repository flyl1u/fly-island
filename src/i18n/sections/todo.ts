export type TodoText = {
  empty: string;
  complete: string;
  markIncomplete: string;
  /** Screen-reader label pairing an action with the task it targets. */
  actionOnTask: (action: string, taskTitle: string) => string;
  editTitle: string;
  start: string;
  stop: string;
  chooseDuration: string;
  countdown: string;
  minutes: (count: number) => string;
  minutesUnit: string;
  presets: string;
  durationShort: (minutes: number | null) => string;
  changeDuration: (current: string) => string;
  startFor: (minutes: number) => string;
  endsAt: (time: string) => string;
  unlimited: string;
  cancelTimer: string;
  remainingTime: (time: string) => string;
  timeUp: string;
  repeatTimer: string;
  delete: string;
  deleteTask: (taskTitle: string) => string;
  reorderTask: (taskTitle: string) => string;
};

export const zhCN: TodoText = {
  empty: "今天还很轻",
  complete: "完成",
  markIncomplete: "标记未完成",
  actionOnTask: (action, taskTitle) => `${action}：${taskTitle}`,
  editTitle: "编辑任务名",
  start: "开始",
  stop: "结束",
  chooseDuration: "选择待办时长",
  countdown: "待办倒计时",
  minutes: (count) => `${count} 分钟`,
  minutesUnit: "分钟",
  presets: "常用时长",
  durationShort: (minutes) => (minutes === null ? "不限" : `${minutes}分`),
  changeDuration: (current) => `更改时长，当前 ${current}`,
  startFor: (minutes) => `开始 ${minutes} 分钟`,
  endsAt: (time) => `${time} 结束`,
  unlimited: "不限时",
  cancelTimer: "取消",
  remainingTime: (time) => `剩余 ${time}`,
  timeUp: "时间到",
  repeatTimer: "再来一轮",
  delete: "删除",
  deleteTask: (taskTitle) => `删除：${taskTitle}`,
  reorderTask: (taskTitle) => `拖动排序：${taskTitle}`,
};

export const en: TodoText = {
  empty: "A light day so far",
  complete: "Complete",
  markIncomplete: "Mark incomplete",
  actionOnTask: (action, taskTitle) => `${action}: ${taskTitle}`,
  editTitle: "Edit task name",
  start: "Start",
  stop: "Stop",
  chooseDuration: "Choose task duration",
  countdown: "Task countdown",
  minutes: (count) => `${count} min`,
  minutesUnit: "min",
  presets: "Common durations",
  durationShort: (minutes) => (minutes === null ? "No limit" : `${minutes}m`),
  changeDuration: (current) => `Change duration, now ${current}`,
  startFor: (minutes) => `Start ${minutes} min`,
  endsAt: (time) => `Ends at ${time}`,
  unlimited: "No limit",
  cancelTimer: "Cancel",
  remainingTime: (time) => `${time} remaining`,
  timeUp: "Time’s up",
  repeatTimer: "Another round",
  delete: "Delete",
  deleteTask: (taskTitle) => `Delete: ${taskTitle}`,
  reorderTask: (taskTitle) => `Reorder: ${taskTitle}`,
};
