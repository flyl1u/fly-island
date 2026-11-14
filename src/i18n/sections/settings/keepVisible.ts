export type SettingsKeepVisibleText = {
  title: string;
  hint: string;
  keepVisibleWhileAgentRunning: string;
  keepVisibleWhileLyrics: string;
  keepVisibleWhileTodoRunning: string;
};

export const zhCN: SettingsKeepVisibleText = {
  title: "这些时候不贴边",
  hint: "开启后，小岛在这些时候不会自动贴到屏幕顶部，结束后再按设定的时间贴边。",
  keepVisibleWhileAgentRunning: "Agent 正在运行",
  keepVisibleWhileLyrics: "小岛在显示歌词",
  keepVisibleWhileTodoRunning: "待办已经开始计时",
};

export const en: SettingsKeepVisibleText = {
  title: "Stay visible while",
  hint: "The island stays visible during these activities, then waits the set time before tucking to the top.",
  keepVisibleWhileAgentRunning: "An agent is working",
  keepVisibleWhileLyrics: "Lyrics are showing",
  keepVisibleWhileTodoRunning: "A to-do is in progress",
};
