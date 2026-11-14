export type SettingsResetAppearanceText = {
  label: string;
  hint: string;
  confirm: string;
  cancel: string;
};

export const zhCN: SettingsResetAppearanceText = {
  label: "恢复默认外观",
  hint: "主题、颜色、字体与大小、刘海外形和显示内容恢复为默认值；待办设置、自动收起和已保存的预设不受影响",
  confirm: "确认恢复",
  cancel: "取消",
};

export const en: SettingsResetAppearanceText = {
  label: "Reset appearance",
  hint: "Theme, colors, text, sizes, notch and display go back to defaults. Todo options, auto tuck and saved presets are kept.",
  confirm: "Reset",
  cancel: "Cancel",
};
