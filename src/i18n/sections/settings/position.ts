export type SettingsPositionText = {
  title: string;
  moveHint: string;
  lock: string;
  lockHint: string;
  /** Row that puts the island back where it starts. */
  resetRow: string;
  reset: string;
};

export const zhCN: SettingsPositionText = {
  title: "位置",
  lock: "锁定小岛位置",
  lockHint: "开启后无法通过拖动移动小岛，仍可使用复位。",
  moveHint: "收起时直接拖动小岛；展开时按住 Ctrl 再拖。拖到屏幕顶部附近会自动贴齐。",
  resetRow: "回到默认位置",
  reset: "复位",
};

export const en: SettingsPositionText = {
  title: "Position",
  lock: "Lock island position",
  lockHint: "Prevent moving the island by dragging. Reset remains available.",
  moveHint: "Drag the collapsed island to move it; when it is open, hold Ctrl while dragging. Drop it near the top of the screen to snap flush.",
  resetRow: "Back to the default position",
  reset: "Reset",
};
