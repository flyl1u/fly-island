export type SettingsShortcutsText = {
  globalTitle: string;
  globalHint: string;
  openTranslation: string;
  noGlobal: string;
  islandTitle: string;
  collapse: string;
  moveIsland: string;
  ctrlDrag: string;
  inputTitle: string;
  translate: string;
  newLine: string;
  pasteClipboard: string;
  editHint: string;
  openPage: string;
  taken: (shortcut: string, owner: string) => string;
  reset: (shortcut: string) => string;
};

export const zhCN: SettingsShortcutsText = {
  globalTitle: "全局快捷键",
  globalHint: "在任何程序里都能按。点击按钮后按下新的组合键，按 Esc 取消。",
  openTranslation: "打开快捷翻译",
  noGlobal: "翻译和剪贴板都已关闭，暂时没有全局快捷键。",
  islandTitle: "岛上操作",
  collapse: "收起展开的岛",
  moveIsland: "移动岛屿",
  ctrlDrag: "Ctrl + 拖动",
  inputTitle: "翻译输入框",
  translate: "翻译",
  newLine: "换行",
  pasteClipboard: "填入剪贴板（独立窗口）",
  editHint: "快捷键统一在「快捷键」页修改。",
  openPage: "前往快捷键",
  taken: (shortcut, owner) => `${shortcut} 已被「${owner}」使用，请换一个。`,
  reset: (shortcut) => `恢复默认（${shortcut}）`,
};

export const en: SettingsShortcutsText = {
  globalTitle: "Global shortcuts",
  globalHint: "These work in any program. Click a button, then press a new key combination; Esc cancels.",
  openTranslation: "Open quick translation",
  noGlobal: "Translation and clipboard history are both off, so there are no global shortcuts.",
  islandTitle: "On the island",
  collapse: "Collapse the expanded island",
  moveIsland: "Move the island",
  ctrlDrag: "Ctrl + drag",
  inputTitle: "Translation input",
  translate: "Translate",
  newLine: "New line",
  pasteClipboard: "Fill from the clipboard (window only)",
  editHint: "Shortcuts are changed on the Shortcuts page.",
  openPage: "Open Shortcuts",
  taken: (shortcut, owner) => `${shortcut} is already used by "${owner}". Choose another.`,
  reset: (shortcut) => `Reset to default (${shortcut})`,
};
