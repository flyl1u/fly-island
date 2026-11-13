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
  focusTimerDescription: "点「开始」后倒计时，到点提醒；左侧怀表可改时长",
  dragToReorder: "拖动调整顺序",
  dragToReorderDescription: "按住待办右侧的手柄上下拖动",
  title: "任务",
  carryOverIncomplete: "自动将未完成任务写入下一天",
};

export const en: SettingsTodoText = {
  focusTimer: "Focus timer",
  focusTimerDescription: "Start counts down and reminds you when time is up; the watch beside it changes the time",
  dragToReorder: "Drag to reorder",
  dragToReorderDescription: "Hold the handle on the right of a todo and drag it up or down",
  title: "Tasks",
  carryOverIncomplete: "Carry unfinished tasks to next day",
};
