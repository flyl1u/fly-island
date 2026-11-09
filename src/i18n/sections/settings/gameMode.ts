export type SettingsGameModeText = {
  title: string;
  hint: string;
  doNotDisturb: string;
  doNotDisturbHint: string;
  autoTuck: string;
  autoTuckHint: string;
};

export const zhCN: SettingsGameModeText = {
  title: "游戏模式",
  hint: "前台是全屏程序时生效，比如游戏、全屏视频和演示。",
  doNotDisturb: "游戏勿扰",
  doNotDisturbHint: "不悬停展开，不抢键盘焦点，不弹消息预览，已展开的面板会收起。消息照常接收。",
  autoTuck: "游戏时贴边隐藏",
  autoTuckHint: "全屏程序占住岛所在的屏幕时贴到顶部，退出后自动露出。",
};

export const en: SettingsGameModeText = {
  title: "Game mode",
  hint: "Applies while a full-screen app is in front, such as a game, a full-screen video or slides.",
  doNotDisturb: "Do not disturb in games",
  doNotDisturbHint: "No opening on hover, no taking the keyboard focus, no message pop-ups, and an open panel closes. Messages still arrive.",
  autoTuck: "Tuck away during games",
  autoTuckHint: "Tucks to the top edge while a full-screen app fills the island's screen, and slides back out afterwards.",
};
