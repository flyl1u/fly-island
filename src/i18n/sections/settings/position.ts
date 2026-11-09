export type SettingsPositionText = {
  title: string;
  moveHint: string;
  /** Row that puts the island back where it starts. */
  resetRow: string;
  reset: string;
  /** Which monitor the island sits on (roadmap C1). */
  monitor: string;
  monitorOptions: Record<"primary" | "cursor" | "foreground", string>;
  monitorHint: string;
};

export const zhCN: SettingsPositionText = {
  title: "位置",
  moveHint: "按住 Ctrl 键，用鼠标左键拖动灵动岛的任意位置即可移动它，展开时也可以；收起时直接拖动也行。拖到屏幕顶部附近会自动贴齐。",
  resetRow: "回到默认位置",
  reset: "复位",
  monitor: "显示在",
  monitorOptions: { primary: "主显示器", cursor: "鼠标所在的显示器", foreground: "前台窗口所在的显示器" },
  monitorHint: "跟随鼠标或前台窗口时，岛屿收起状态下会移到那块屏幕的顶部中间；展开时等收起后再移。换屏后拖动过的位置会清掉。",
};

export const en: SettingsPositionText = {
  title: "Position",
  moveHint: "Hold Ctrl and drag any part of the island with the left mouse button to move it, even while it is open. When collapsed, a plain drag works too. Drop it near the top of the screen to snap flush.",
  resetRow: "Back to the default position",
  reset: "Reset",
  monitor: "Show on",
  monitorOptions: { primary: "Primary display", cursor: "Display with the pointer", foreground: "Display with the active window" },
  monitorHint: "When following the pointer or the active window, a collapsed island moves to the top middle of that display; an open one waits until it collapses. A dragged position is cleared when it moves.",
};
