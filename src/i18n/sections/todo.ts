export type TodoText = {
  empty: string;
  emptyReview: string;
  complete: string;
  markIncomplete: string;
  /** Screen-reader label pairing an action with the task it targets. */
  actionOnTask: (action: string, taskTitle: string) => string;
  editTitle: string;
  start: string;
  stop: string;
  delete: string;
  deleteTask: (taskTitle: string) => string;
  reorder: string;
  reorderTask: (taskTitle: string) => string;
  /** The right-click menu plugins add commands to. */
  pluginMenu: string;
};

export const zhCN: TodoText = {
  empty: "今天还很轻",
  emptyReview: "Nothing was written here",
  complete: "完成",
  markIncomplete: "标记未完成",
  actionOnTask: (action, taskTitle) => `${action}：${taskTitle}`,
  editTitle: "编辑任务名",
  start: "开始",
  stop: "结束",
  delete: "删除",
  deleteTask: (taskTitle) => `删除：${taskTitle}`,
  reorder: "拖动排序",
  reorderTask: (taskTitle) => `拖动排序：${taskTitle}`,
  pluginMenu: "插件操作",
};

export const en: TodoText = {
  empty: "A light day so far",
  emptyReview: "Nothing was written here",
  complete: "Complete",
  markIncomplete: "Mark incomplete",
  actionOnTask: (action, taskTitle) => `${action}: ${taskTitle}`,
  editTitle: "Edit task name",
  start: "Start",
  stop: "Stop",
  delete: "Delete",
  deleteTask: (taskTitle) => `Delete: ${taskTitle}`,
  reorder: "Drag to reorder",
  reorderTask: (taskTitle) => `Reorder: ${taskTitle}`,
  pluginMenu: "Plugin actions",
};
