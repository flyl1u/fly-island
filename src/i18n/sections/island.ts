export type IslandText = {
  appName: string;
  focusing: (taskTitle: string) => string;
  pendingTodos: (count: number) => string;
  agentSession: (provider: string, title: string) => string;
  openMusic: string;
  collapse: string;
  collapseIsland: string;
  minimizeToTray: string;
  tuckToTop: string;
  resetPosition: string;
  resetPositionLabel: string;
  editor: string;
  todoList: string;
  music: string;
  clipboardHistory: string;
  shelf: string;
  calendar: string;
  shelfCount: (count: number) => string;
  /** The collapsed island's camera and microphone icons, naming the apps using them. */
  deviceInUse: Record<"camera" | "microphone", (apps: string) => string>;
  deviceAppSeparator: string;
  /** The volume and brightness popup on the collapsed island. */
  levelPopup: { volume: (percent: number) => string; brightness: (percent: number) => string; muted: string; mutedShort: string };
  /** Headphones and Bluetooth audio connecting, a Bluetooth battery running low, the charger. */
  deviceAlert: {
    connected: (name: string) => string;
    disconnected: (name: string) => string;
    batteryLow: (name: string) => string;
    charging: string;
    unplugged: string;
    battery: (percent: number) => string;
  };
  layoutEditor: string;
};

export const zhCN: IslandText = {
  appName: "fly-island",
  focusing: (taskTitle) => `正在专注：${taskTitle}`,
  pendingTodos: (count) => `剩余${count}个待办`,
  agentSession: (provider, title) => `${provider} 正在处理：${title}`,
  openMusic: "打开音乐控制",
  collapse: "收起",
  collapseIsland: "收起岛屿",
  minimizeToTray: "最小化到托盘",
  tuckToTop: "收起到屏幕顶部",
  resetPosition: "复位",
  resetPositionLabel: "回到主屏顶部居中",
  editor: "岛屿编辑",
  todoList: "任务清单",
  music: "Music",
  clipboardHistory: "剪贴板历史",
  shelf: "文件中转",
  calendar: "日历",
  shelfCount: (count) => `文件中转里有 ${count} 个文件`,
  deviceInUse: {
    camera: (apps) => `${apps} 正在使用摄像头，点击打开隐私设置`,
    microphone: (apps) => `${apps} 正在使用麦克风，点击打开隐私设置`,
  },
  deviceAppSeparator: "、",
  levelPopup: { volume: (percent) => `音量 ${percent}%`, brightness: (percent) => `亮度 ${percent}%`, muted: "已静音", mutedShort: "静音" },
  deviceAlert: {
    connected: (name) => `${name} 已连接`,
    disconnected: (name) => `${name} 已断开`,
    batteryLow: (name) => `${name} 电量低`,
    charging: "正在充电",
    unplugged: "已拔下电源",
    battery: (percent) => `电量 ${percent}%`,
  },
  layoutEditor: "布局编辑",
};

export const en: IslandText = {
  appName: "fly-island",
  focusing: (taskTitle) => `Focusing: ${taskTitle}`,
  pendingTodos: (count) => (count === 1 ? "1 todo left" : `${count} todos left`),
  agentSession: (provider, title) => `${provider} is working on: ${title}`,
  openMusic: "Open music controls",
  collapse: "Collapse",
  collapseIsland: "Collapse island",
  minimizeToTray: "Minimize to tray",
  tuckToTop: "Tuck to top edge",
  resetPosition: "Reset",
  resetPositionLabel: "Reset island to the top center of the primary screen",
  editor: "Island editor",
  todoList: "Tasks",
  music: "Music",
  clipboardHistory: "Clipboard history",
  shelf: "File shelf",
  calendar: "Calendar",
  shelfCount: (count) => (count === 1 ? "1 file on the shelf" : `${count} files on the shelf`),
  deviceInUse: {
    camera: (apps) => `${apps} using the camera; click for privacy settings`,
    microphone: (apps) => `${apps} using the microphone; click for privacy settings`,
  },
  deviceAppSeparator: ", ",
  levelPopup: { volume: (percent) => `Volume ${percent}%`, brightness: (percent) => `Brightness ${percent}%`, muted: "Muted", mutedShort: "Off" },
  deviceAlert: {
    connected: (name) => `${name} connected`,
    disconnected: (name) => `${name} disconnected`,
    batteryLow: (name) => `${name} battery low`,
    charging: "Charging",
    unplugged: "On battery",
    battery: (percent) => `Battery ${percent}%`,
  },
  layoutEditor: "Layout editor",
};
