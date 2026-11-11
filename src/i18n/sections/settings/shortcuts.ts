export type SettingsShortcutsText = {
  globalHint: string;
  openTranslation: string;
  taken: (shortcut: string, owner: string) => string;
  /** Windows refused the keys; `kept` is the shortcut still in use, when there is one. */
  registerFailed: (shortcut: string, kept?: string) => string;
  reset: (shortcut: string) => string;
};

export const zhCN: SettingsShortcutsText = {
  globalHint: "在任何程序里都能按。点击按钮后按下新的组合键，按 Esc 取消。",
  openTranslation: "打开快捷翻译",
  taken: (shortcut, owner) => `${shortcut} 已被「${owner}」使用，请换一个。`,
  registerFailed: (shortcut, kept) =>
    `${shortcut} 没能设为全局快捷键，可能已被其他程序占用，请换一个。${kept ? `现在仍是 ${kept}。` : ""}`,
  reset: (shortcut) => `恢复默认（${shortcut}）`,
};

export const en: SettingsShortcutsText = {
  globalHint: "These work in any program. Click a button, then press a new key combination; Esc cancels.",
  openTranslation: "Open quick translation",
  taken: (shortcut, owner) => `${shortcut} is already used by "${owner}". Choose another.`,
  registerFailed: (shortcut, kept) =>
    `${shortcut} could not be set as a global shortcut; another program may be using it. Choose another.${kept ? ` Still using ${kept}.` : ""}`,
  reset: (shortcut) => `Reset to default (${shortcut})`,
};
