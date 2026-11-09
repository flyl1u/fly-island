export type SettingsLayoutText = {
  collapsedScale: string;
  expandedScale: string;
  showCollapsedText: string;
  showIdleTodoCount: string;
  title: string;
  /** Appearance page groups: the island's scale and panel height, then its corners. */
  sizeTitle: string;
  cornersTitle: string;
  opacity: string;
  marginY: string;
  islandCornerRadius: string;
  islandCornerShape: string;
  cornerShapeSquircle: string;
  cornerShapeRound: string;
  maxPanelHeight: string;
  launchAtStartup: string;
  showTitle: string;
  displayTitle: string;
  minimizeAction: string;
  minimizeToTray: string;
  minimizeToTop: string;
  autoTuck: string;
  autoTuckSeconds: string;
  autoTuckRetract: string;
  autoTuckRetractDelay: string;
  autoTuckHint: string;
  minimizeHint: string;
  /** A duration in seconds, already rounded, as a settings value shows it. */
  seconds: (value: number) => string;
  minutes: (value: number) => string;
  resetToDefault: string;
};

export const zhCN: SettingsLayoutText = {
  collapsedScale: "折叠岛屿大小",
  expandedScale: "展开面板大小",
  showCollapsedText: "显示折叠岛屿文字",
  showIdleTodoCount: "空闲时显示剩余待办数",
  title: "尺寸与位置",
  sizeTitle: "尺寸",
  cornersTitle: "圆角",
  opacity: "不透明度",
  marginY: "顶部距离",
  islandCornerRadius: "岛屿圆角",
  islandCornerShape: "圆角样式",
  cornerShapeSquircle: "方圆",
  cornerShapeRound: "圆角",
  maxPanelHeight: "最大面板高度",
  launchAtStartup: "开机自启动",
  showTitle: "显示岛屿名称",
  displayTitle: "显示内容",
  minimizeAction: "最小化按钮",
  minimizeToTray: "托盘",
  minimizeToTop: "贴边隐藏",
  autoTuck: "闲置时贴边隐藏",
  autoTuckSeconds: "闲置多久后隐藏",
  autoTuckRetract: "鼠标移开后再次隐藏",
  autoTuckRetractDelay: "再次隐藏前等待",
  autoTuckHint: "一段时间没有操作后，岛屿贴到屏幕顶部，只露出一条边。",
  minimizeHint: "点岛上的最小化按钮时，隐藏到托盘还是贴到屏幕顶部。",
  seconds: (value) => `${value} 秒`,
  minutes: (value) => `${value} 分钟`,
  resetToDefault: "恢复默认值",
};

export const en: SettingsLayoutText = {
  collapsedScale: "Collapsed island scale",
  expandedScale: "Expanded panel scale",
  showCollapsedText: "Show collapsed island text",
  showIdleTodoCount: "Show todo count when idle",
  title: "Size & position",
  sizeTitle: "Size",
  cornersTitle: "Corners",
  opacity: "Opacity",
  marginY: "Top margin",
  islandCornerRadius: "Island corner radius",
  islandCornerShape: "Corner style",
  cornerShapeSquircle: "Squircle",
  cornerShapeRound: "Round",
  maxPanelHeight: "Max panel height",
  launchAtStartup: "Launch at startup",
  showTitle: "Show island name",
  displayTitle: "Display",
  minimizeAction: "Minimize button",
  minimizeToTray: "Tray",
  minimizeToTop: "Tuck to edge",
  autoTuck: "Tuck to the edge when idle",
  autoTuckSeconds: "Idle time",
  autoTuckRetract: "Tuck again when the pointer leaves",
  autoTuckRetractDelay: "Wait before tucking again",
  autoTuckHint: "After a while without use, the island slides up to the top of the screen and shows only an edge.",
  minimizeHint: "Whether the island's minimize button hides it in the tray or tucks it to the top edge.",
  seconds: (value) => `${value} s`,
  minutes: (value) => `${value} min`,
  resetToDefault: "Reset to default",
};
