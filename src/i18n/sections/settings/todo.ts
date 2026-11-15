export type SettingsTodoText = {
  collapsedTitle: string;
  rotateTodos: string;
  rotationCount: string;
  rotationMode: string;
  switchMode: string;
  scrollMode: string;
  rotationSeconds: string;
  scrollSpeed: string;
  scrollSpeedValue: (value: number) => string;
  focusTimer: string;
  focusTimerDescription: string;
  dragToReorder: string;
  dragToReorderDescription: string;
  title: string;
  carryOverIncomplete: string;
};

export const zhCN: SettingsTodoText = {
  collapsedTitle: "折叠岛屿",
  rotateTodos: "轮换显示",
  rotationCount: "待办条数",
  rotationMode: "轮换方式",
  switchMode: "切换",
  scrollMode: "滚动",
  rotationSeconds: "每条停留",
  scrollSpeed: "滚动速度",
  scrollSpeedValue: (value) => `${value} 像素/秒`,
  focusTimer: "番茄钟",
  focusTimerDescription: "点「开始」后倒计时，到点提醒；左侧怀表可改时长",
  dragToReorder: "拖动调整顺序",
  dragToReorderDescription: "按住待办右侧的手柄上下拖动",
  title: "任务",
  carryOverIncomplete: "自动将未完成任务写入下一天",
};

export const en: SettingsTodoText = {
  collapsedTitle: "Collapsed island",
  rotateTodos: "Rotate todos",
  rotationCount: "Todo count",
  rotationMode: "Rotation mode",
  switchMode: "Switch",
  scrollMode: "Scroll",
  rotationSeconds: "Time per todo",
  scrollSpeed: "Scroll speed",
  scrollSpeedValue: (value) => `${value} px/s`,
  focusTimer: "Focus timer",
  focusTimerDescription: "Start counts down and reminds you when time is up; the watch beside it changes the time",
  dragToReorder: "Drag to reorder",
  dragToReorderDescription: "Hold the handle on the right of a todo and drag it up or down",
  title: "Tasks",
  carryOverIncomplete: "Carry unfinished tasks to next day",
};
