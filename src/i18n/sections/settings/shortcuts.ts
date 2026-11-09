export type SettingsShortcutsText = {
  globalHint: string;
  openTranslation: string;
  taken: (shortcut: string, owner: string) => string;
  reset: (shortcut: string) => string;
};

export const zhCN: SettingsShortcutsText = {
  globalHint: "在任何程序里都能按。点击按钮后按下新的组合键，按 Esc 取消。",
  openTranslation: "打开快捷翻译",
  taken: (shortcut, owner) => `${shortcut} 已被「${owner}」使用，请换一个。`,
  reset: (shortcut) => `恢复默认（${shortcut}）`,
};

export const en: SettingsShortcutsText = {
  globalHint: "These work in any program. Click a button, then press a new key combination; Esc cancels.",
  openTranslation: "Open quick translation",
  taken: (shortcut, owner) => `${shortcut} is already used by "${owner}". Choose another.`,
  reset: (shortcut) => `Reset to default (${shortcut})`,
};
