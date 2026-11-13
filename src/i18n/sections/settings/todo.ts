export type SettingsTodoText = {
  dragToReorder: string;
  dragToReorderDescription: string;
  title: string;
  carryOverIncomplete: string;
};

export const zhCN: SettingsTodoText = {
  dragToReorder: "拖动调整顺序",
  dragToReorderDescription: "按住待办右侧的手柄上下拖动",
  title: "任务",
  carryOverIncomplete: "自动将未完成任务写入下一天",
};

export const en: SettingsTodoText = {
  dragToReorder: "Drag to reorder",
  dragToReorderDescription: "Hold the handle on the right of a todo and drag it up or down",
  title: "Tasks",
  carryOverIncomplete: "Carry unfinished tasks to next day",
};
