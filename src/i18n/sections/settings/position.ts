export type SettingsPositionText = {
  title: string;
  moveHint: string;
  reset: string;
  resetHint: string;
};

export const zhCN: SettingsPositionText = {
  title: "位置",
  moveHint: "按住 Ctrl 键，用鼠标左键拖动灵动岛的任意位置即可移动它，展开时也可以；收起时直接拖动也行。拖到屏幕顶部附近会自动贴齐。",
  reset: "复位",
  resetHint: "回到主屏幕顶部居中，顶部距离恢复默认",
};

export const en: SettingsPositionText = {
  title: "Position",
  moveHint: "Hold Ctrl and drag any part of the island with the left mouse button to move it, even while it is open. When collapsed, a plain drag works too. Drop it near the top of the screen to snap flush.",
  reset: "Reset",
  resetHint: "Back to the top center of the primary screen, with the default top margin",
};
