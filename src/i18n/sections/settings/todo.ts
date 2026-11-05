export type SettingsTodoText = {
  title: string;
  carryOverIncomplete: string;
  enableReorder: string;
  rotateTodos: string;
  rotationSeconds: string;
};

export const zhCN: SettingsTodoText = {
  title: "任务",
  carryOverIncomplete: "自动将未完成任务写入下一天",
  enableReorder: "允许拖动调整任务顺序",
  rotateTodos: "多任务流动",
  rotationSeconds: "每个任务停留时间（秒）",
};

export const en: SettingsTodoText = {
  title: "Tasks",
  carryOverIncomplete: "Carry unfinished tasks to next day",
  enableReorder: "Drag to reorder tasks",
  rotateTodos: "Rotate through pending tasks",
  rotationSeconds: "Time per task (seconds)",
};
