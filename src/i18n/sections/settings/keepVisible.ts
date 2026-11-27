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
  keepVisibleWhileAgentRunning: "Agent 运行时不贴边",
  keepVisibleWhileLyrics: "播放音乐时不贴边",
  keepVisibleWhileTodoRunning: "待办计时时不贴边",
};

export const en: SettingsKeepVisibleText = {
  title: "Stay visible while",
  hint: "The island stays visible during these activities, then waits the set time before tucking to the top.",
  keepVisibleWhileAgentRunning: "Stay out while an agent works",
  keepVisibleWhileLyrics: "Stay out while music plays",
  keepVisibleWhileTodoRunning: "Stay out while a to-do is timed",
};
