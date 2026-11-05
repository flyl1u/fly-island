export type SettingsTranslationText = {
  serviceTitle: string;
  targetTitle: string;
  target: string;
  targetWindow: string;
  targetIsland: string;
  targetHint: string;
  behaviorTitle: string;
  pasteOnOpen: string;
  pasteOnOpenHint: string;
  autoTranslate: string;
  autoTranslateHint: string;
  selectionShortcut: string;
  selectionShortcutHint: string;
};

export const zhCN: SettingsTranslationText = {
  serviceTitle: "翻译服务",
  targetTitle: "打开位置",
  target: "翻译打开在",
  targetWindow: "独立窗口",
  targetIsland: "岛内页面",
  targetHint: "选岛内页面时，顶栏翻译按钮、快捷键和点击岛上的译文都会打开岛屿里的翻译页；独立窗口不再弹出。",
  behaviorTitle: "翻译方式",
  pasteOnOpen: "打开时填入剪贴板",
  pasteOnOpenHint: "原文为空时，用最新一条文字剪贴板填上。已有内容不会被覆盖。",
  autoTranslate: "停稳后自动翻译",
  autoTranslateHint: "原文停止输入约半秒后自动翻译。未配置密钥时不发送。",
  selectionShortcut: "翻译选中文字",
  selectionShortcutHint: "在其他窗口选中文字后按下。会临时复制选中内容再还原剪贴板，不记入剪贴板历史。没有选中时翻译剪贴板里的文字。",
};

export const en: SettingsTranslationText = {
  serviceTitle: "Translation service",
  targetTitle: "Where it opens",
  target: "Open translation in",
  targetWindow: "Its own window",
  targetIsland: "An island page",
  targetHint: "With the island page, the header button, the shortcut and a click on the quick result open the translation page on the island instead of the window.",
  behaviorTitle: "How to translate",
  pasteOnOpen: "Fill from the clipboard on open",
  pasteOnOpenHint: "When the source is empty, fill it from the latest clipboard text. Existing text is left as it is.",
  autoTranslate: "Translate after you pause",
  autoTranslateHint: "Translate about half a second after the source stops changing. Nothing is sent without an API key.",
  selectionShortcut: "Translate selected text",
  selectionShortcutHint: "Press it after selecting text in another window. The selection is copied and the clipboard is restored, and it is not added to clipboard history. With nothing selected, the clipboard text is translated.",
};
