export type SettingsLayoutText = {
  title: string;
  opacity: string;
  launchAtStartup: string;
  launchAtStartupDisabledHint: string;
  autoTuck: string;
  autoTuckHint: string;
  neverAutoTuck: string;
  neverAutoTuckHint: string;
  neverAutoTuckOverrides: string;
  /** Game mode: quiet while a full-screen app (usually a game) is in front. */
  gameTitle: string;
  gameQuiet: string;
  gameQuietHint: string;
  resetToDefault: string;
};

export const zhCN: SettingsLayoutText = {
  title: "尺寸与位置",
  opacity: "不透明度",
  launchAtStartup: "开机自启动",
  launchAtStartupDisabledHint: "Windows 启动应用已将 Fly Island 禁用；请在任务管理器的启动应用中重新启用。",
  autoTuck: "闲置时贴边隐藏",
  autoTuckHint: "收起的岛屿一段时间没有操作后，贴到屏幕顶部，只露出一条边。",
  neverAutoTuck: "永远不自动贴边",
  neverAutoTuckHint: "只有点减号或在收起的岛屿上右键，才会贴边；闲置、游戏模式、浏览器等都不会自动收起。",
  neverAutoTuckOverrides: "已开启“永远不自动贴边”，此项不生效。",
  gameTitle: "游戏模式",
  gameQuiet: "全屏时免打扰",
  gameQuietHint: "全屏游戏、视频或演示在前台时，岛屿不悬停展开、不抢焦点、不弹消息。",
  resetToDefault: "恢复默认值",
};

export const en: SettingsLayoutText = {
  title: "Size & position",
  opacity: "Opacity",
  launchAtStartup: "Launch at startup",
  launchAtStartupDisabledHint: "Windows Startup Apps has disabled Fly Island; re-enable it in Task Manager.",
  autoTuck: "Tuck to the edge when idle",
  autoTuckHint: "After a while without use, the collapsed island slides up to the top of the screen and shows only an edge.",
  neverAutoTuck: "Never tuck automatically",
  neverAutoTuckHint: "The island tucks only when you click the minus button or right-click the collapsed island; idle time, game mode and browsers never tuck it.",
  neverAutoTuckOverrides: "“Never tuck automatically” is on, so this has no effect.",
  gameTitle: "Game mode",
  gameQuiet: "Quiet in full screen",
  gameQuietHint: "While a full-screen game, video or slideshow is in front, the island doesn't open on hover, take the focus or pop up messages.",
  resetToDefault: "Reset to default",
};
