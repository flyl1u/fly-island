export type SettingsTodoText = {
  focusTimer: string;
  focusTimerDescription: string;
  dragToReorder: string;
  dragToReorderDescription: string;
  title: string;
  carryOverIncomplete: string;
};

export const zhCN: SettingsTodoText = {
  focusTimer: "番茄钟",
  focusTimerDescription: "点「开始」时可以选择时长，到点提醒",
  dragToReorder: "拖动调整顺序",
  dragToReorderDescription: "按住待办右侧的手柄上下拖动",
  title: "任务",
  carryOverIncomplete: "自动将未完成任务写入下一天",
};

export const en: SettingsTodoText = {
  focusTimer: "Focus timer",
  focusTimerDescription: "Pick a duration when you start a todo and get a reminder when time is up",
  dragToReorder: "Drag to reorder",
  dragToReorderDescription: "Hold the handle on the right of a todo and drag it up or down",
  title: "Tasks",
  carryOverIncomplete: "Carry unfinished tasks to next day",
};
