export type SettingsLayoutText = {
  collapsedScale: string;
  title: string;
  opacity: string;
  launchAtStartup: string;
  autoTuck: string;
  autoTuckHint: string;
  resetToDefault: string;
};

export const zhCN: SettingsLayoutText = {
  collapsedScale: "岛屿大小",
  title: "尺寸与位置",
  opacity: "不透明度",
  launchAtStartup: "开机自启动",
  autoTuck: "闲置时贴边隐藏",
  autoTuckHint: "一段时间没有操作后，岛屿贴到屏幕顶部，只露出一条边。",
  resetToDefault: "恢复默认值",
};

export const en: SettingsLayoutText = {
  collapsedScale: "Island size",
  title: "Size & position",
  opacity: "Opacity",
  launchAtStartup: "Launch at startup",
  autoTuck: "Tuck to the edge when idle",
  autoTuckHint: "After a while without use, the island slides up to the top of the screen and shows only an edge.",
  resetToDefault: "Reset to default",
};
