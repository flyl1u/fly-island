export type SettingsColorsText = {
  title: string;
  taskText: string;
  pulse: string;
  islandBackground: string;
  /** The text on the expanded pages, and its reset to following the background. */
  pageText: string;
  pageTextAuto: string;
  restore: string;
  presets: string;
  savePreset: string;
  applyPreset: string;
  deletePreset: string;
  paletteLabel: (background: string, task: string, pulse: string) => string;
};

export const zhCN: SettingsColorsText = {
  title: "颜色",
  taskText: "任务/待办字样",
  pulse: "亮点颜色",
  islandBackground: "岛屿背景",
  pageText: "页面文字",
  pageTextAuto: "跟随背景",
  restore: "恢复上一版颜色",
  presets: "预设",
  savePreset: "保存当前颜色为预设",
  applyPreset: "应用颜色预设",
  deletePreset: "删除颜色预设",
  paletteLabel: (background, task, pulse) => `背景 ${background}，任务文字 ${task}，亮点 ${pulse}`,
};

export const en: SettingsColorsText = {
  title: "Colors",
  taskText: "Task text",
  pulse: "Accent",
  islandBackground: "Island background",
  pageText: "Page text",
  pageTextAuto: "Follow background",
  restore: "Restore previous colors",
  presets: "Presets",
  savePreset: "Save current colors as a preset",
  applyPreset: "Apply color preset",
  deletePreset: "Delete color preset",
  paletteLabel: (background, task, pulse) => `background ${background}, task text ${task}, accent ${pulse}`,
};
