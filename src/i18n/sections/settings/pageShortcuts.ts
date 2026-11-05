export type SettingsPageShortcutsText = {
  title: string;
  hint: string;
  digitModifiers: string;
  nextPage: string;
  previousPage: string;
  pressDigit: string;
  pressKeys: string;
};

export const zhCN: SettingsPageShortcutsText = {
  title: "页面切换",
  hint: "数字键从左到右打开页面。鼠标停在展开的岛上，或岛有焦点时生效。Alt+Tab 和 Win+Tab 由 Windows 使用，不能设成翻页。",
  digitModifiers: "数字切页",
  nextPage: "下一页",
  previousPage: "上一页",
  pressDigit: "按下修饰键和数字",
  pressKeys: "按下快捷键",
};

export const en: SettingsPageShortcutsText = {
  title: "Page switching",
  hint: "Number keys open pages from left to right. They work while the cursor rests on the expanded island or the island has focus. Alt+Tab and Win+Tab belong to Windows and can't turn the page.",
  digitModifiers: "Number keys",
  nextPage: "Next page",
  previousPage: "Previous page",
  pressDigit: "Press the modifier and a number",
  pressKeys: "Press the shortcut",
};
