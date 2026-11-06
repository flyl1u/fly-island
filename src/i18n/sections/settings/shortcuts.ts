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
  pluginTitle: string;
  pluginHint: string;
  pluginNone: string;
  pluginNotSet: string;
  pluginOff: string;
  pluginRecord: string;
  pluginPressKeys: string;
  pluginTurnOff: string;
  pluginClear: string;
  pluginInUse: string;
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
  pluginTitle: "插件快捷键",
  pluginHint: "已开启的插件的命令。可以改成别的组合键、关闭，或者恢复插件自带的快捷键；没有快捷键的命令也可以设一个。",
  pluginNone: "已开启的插件都没有命令。",
  pluginNotSet: "未设置",
  pluginOff: "已关闭",
  pluginRecord: "设置快捷键",
  pluginPressKeys: "请按组合键…",
  pluginTurnOff: "关闭这个快捷键",
  pluginClear: "清除快捷键",
  pluginInUse: "这个快捷键已被其他程序占用，没有生效，请换一个。",
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
  pluginTitle: "Plugin shortcuts",
  pluginHint: "Commands of the plugins that are on. Change a shortcut, turn it off, or go back to the plugin's own; commands without one can get one too.",
  pluginNone: "None of the plugins that are on has commands.",
  pluginNotSet: "Not set",
  pluginOff: "Off",
  pluginRecord: "Set shortcut",
  pluginPressKeys: "Press keys…",
  pluginTurnOff: "Turn this shortcut off",
  pluginClear: "Clear the shortcut",
  pluginInUse: "Another app already uses this shortcut, so it does not work. Choose another.",
};
