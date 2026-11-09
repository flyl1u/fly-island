export type SettingsClipboardText = {
  title: string;
  captureImages: string;
  maxItems: string;
  visibleRows: string;
  shortcut: string;
  shortcutEnabled: string;
  pressKeys: string;
};

export const zhCN: SettingsClipboardText = {
  title: "剪贴板历史",
  captureImages: "记录图片",
  maxItems: "最大历史条数",
  visibleRows: "展开后显示条数",
  shortcut: "展开快捷键",
  shortcutEnabled: "启用展开快捷键",
  pressKeys: "按下组合键",
};

export const en: SettingsClipboardText = {
  title: "Clipboard history",
  captureImages: "Record images",
  maxItems: "Max entries",
  visibleRows: "Entries shown when open",
  shortcut: "Expand shortcut",
  shortcutEnabled: "Enable expand shortcut",
  pressKeys: "Press keys",
};
