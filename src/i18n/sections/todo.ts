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
  changeDuration: (minutes: number) => string;
  startFor: (minutes: number) => string;
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
  changeDuration: (minutes) => `计时 ${minutes} 分钟，点击更改`,
  startFor: (minutes) => `开始 ${minutes} 分钟`,
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
  changeDuration: (minutes) => `Timer ${minutes} min, click to change`,
  startFor: (minutes) => `Start ${minutes} min`,
  remainingTime: (time) => `${time} remaining`,
  timeUp: "Time’s up",
  repeatTimer: "Another round",
  delete: "Delete",
  deleteTask: (taskTitle) => `Delete: ${taskTitle}`,
  reorderTask: (taskTitle) => `Reorder: ${taskTitle}`,
};
