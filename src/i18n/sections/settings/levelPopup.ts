export type SettingsLevelPopupText = {
  title: string;
  popup: string;
  popupHint: string;
};

export const zhCN: SettingsLevelPopupText = {
  title: "音量与亮度",
  popup: "调节时在小岛上显示",
  popupHint: "用键盘、任务栏或其他程序调音量或屏幕亮度时，收起的小岛显示当前大小，1.5 秒后恢复。亮度只支持笔记本自带的屏幕。",
};

export const en: SettingsLevelPopupText = {
  title: "Volume and brightness",
  popup: "Show changes on the island",
  popupHint: "When the volume or screen brightness changes, from the keyboard, the taskbar or another app, the collapsed island shows the new level for 1.5 seconds. Brightness works for a laptop's built-in screen only.",
};
