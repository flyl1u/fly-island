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
  /** The settings button while its red dot leads to the community group in About. */
  settingsWithNews: string;
  editor: string;
  todoList: string;
  todoListWithUpdate: string;
  music: string;
  clipboardHistory: string;
  shelf: string;
  /** Short page names in the tips above the header dots. */
  pageNames: { todo: string; music: string; clipboard: string; shelf: string; translation: string };
  /** The tip on the status light, which opens the Agent page. */
  agentPage: string;
  calendar: string;
  shelfCount: (count: number) => string;
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
  settingsWithNews: "设置（关于里有新内容）",
  editor: "岛屿编辑",
  todoList: "任务清单",
  todoListWithUpdate: "任务清单（有新版本）",
  music: "Music",
  clipboardHistory: "剪贴板历史",
  shelf: "文件中转",
  pageNames: { todo: "待办", music: "音乐", clipboard: "剪贴板", shelf: "文件中转", translation: "翻译" },
  agentPage: "AI Agent",
  calendar: "日历",
  shelfCount: (count) => `文件中转里有 ${count} 个文件`,
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
  settingsWithNews: "Settings (something new in About)",
  editor: "Island editor",
  todoList: "Tasks",
  todoListWithUpdate: "Tasks (update available)",
  music: "Music",
  clipboardHistory: "Clipboard history",
  shelf: "File shelf",
  pageNames: { todo: "Todo", music: "Music", clipboard: "Clipboard", shelf: "File shelf", translation: "Translate" },
  agentPage: "AI Agent",
  calendar: "Calendar",
  shelfCount: (count) => (count === 1 ? "1 file on the shelf" : `${count} files on the shelf`),
  layoutEditor: "Layout editor",
};
