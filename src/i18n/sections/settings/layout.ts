export type SettingsLayoutText = {
  collapsedScale: string;
  expandedScale: string;
  showCollapsedText: string;
  showIdleTodoCount: string;
  title: string;
  opacity: string;
  marginY: string;
  topFilletRadius: string;
  islandCornerRadius: string;
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
};

export const zhCN: SettingsLayoutText = {
  collapsedScale: "折叠岛屿大小",
  expandedScale: "展开面板大小",
  showCollapsedText: "显示折叠岛屿文字",
  showIdleTodoCount: "空闲时显示剩余待办数",
  title: "尺寸与位置",
  opacity: "不透明度",
  marginY: "顶部距离",
  topFilletRadius: "贴顶圆角",
  islandCornerRadius: "岛屿圆角",
  maxPanelHeight: "最大面板高度",
  launchAtStartup: "开机自启动",
  showTitle: "显示岛屿名称",
  displayTitle: "显示内容",
  minimizeAction: "最小化按钮",
  minimizeToTray: "托盘",
  minimizeToTop: "收起到顶部",
  autoTuck: "无操作时自动收起到屏幕边缘",
  autoTuckSeconds: "闲置多久后收起（秒）",
  autoTuckRetract: "鼠标移开后重新收起",
  autoTuckRetractDelay: "移开后重新收起延迟",
};

export const en: SettingsLayoutText = {
  collapsedScale: "Collapsed island scale",
  expandedScale: "Expanded panel scale",
  showCollapsedText: "Show collapsed island text",
  showIdleTodoCount: "Show todo count when idle",
  title: "Size & position",
  opacity: "Opacity",
  marginY: "Top margin",
  topFilletRadius: "Top-edge corner radius",
  islandCornerRadius: "Island corner radius",
  maxPanelHeight: "Max panel height",
  launchAtStartup: "Launch at startup",
  showTitle: "Show island name",
  displayTitle: "Display",
  minimizeAction: "Minimize button",
  minimizeToTray: "Tray",
  minimizeToTop: "Top edge",
  autoTuck: "Auto-tuck to screen edge when idle",
  autoTuckSeconds: "Idle time before tucking (seconds)",
  autoTuckRetract: "Tuck again when the pointer leaves",
  autoTuckRetractDelay: "Tuck-again delay after leaving",
};
