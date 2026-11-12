export type SettingsLayoutText = {
  collapsedScale: string;
  /** The expanded island's size, a slider (width and height together). */
  expandedScale: string;
  title: string;
  opacity: string;
  launchAtStartup: string;
  autoTuck: string;
  autoTuckHint: string;
  /** Game mode: quiet while a full-screen app (usually a game) is in front. */
  gameQuiet: string;
  gameQuietHint: string;
  resetToDefault: string;
};

export const zhCN: SettingsLayoutText = {
  collapsedScale: "收起时的大小",
  expandedScale: "展开后的大小",
  title: "尺寸与位置",
  opacity: "不透明度",
  launchAtStartup: "开机自启动",
  autoTuck: "闲置时贴边隐藏",
  autoTuckHint: "收起的岛屿一段时间没有操作后，贴到屏幕顶部，只露出一条边。",
  gameQuiet: "游戏模式",
  gameQuietHint: "全屏游戏、视频或演示在前台时，岛屿不悬停展开、不抢焦点、不弹消息。",
  resetToDefault: "恢复默认值",
};

export const en: SettingsLayoutText = {
  collapsedScale: "Collapsed size",
  expandedScale: "Expanded size",
  title: "Size & position",
  opacity: "Opacity",
  launchAtStartup: "Launch at startup",
  autoTuck: "Tuck to the edge when idle",
  autoTuckHint: "After a while without use, the collapsed island slides up to the top of the screen and shows only an edge.",
  gameQuiet: "Game mode",
  gameQuietHint: "While a full-screen game, video or slideshow is in front, the island doesn't open on hover, take the focus or pop up messages.",
  resetToDefault: "Reset to default",
};
