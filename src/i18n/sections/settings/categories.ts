export type SettingsCategoriesText = {
  label: string;
  groups: {
    basics: string;
    features: string;
    extensions: string;
  };
  general: string;
  appearance: string;
  shortcuts: string;
  notifications: string;
  todos: string;
  music: string;
  clipboard: string;
  translation: string;
  shelf: string;
  agents: string;
  plugins: string;
  market: string;
  about: string;
};

export const zhCN: SettingsCategoriesText = {
  label: "设置分类",
  groups: {
    basics: "基础",
    features: "功能",
    extensions: "扩展",
  },
  general: "通用",
  appearance: "外观",
  shortcuts: "快捷键",
  notifications: "通知",
  todos: "待办",
  music: "音乐",
  clipboard: "剪贴板",
  translation: "翻译",
  shelf: "文件中转",
  agents: "AI Agent",
  plugins: "插件扩展",
  market: "插件市场",
  about: "关于",
};

export const en: SettingsCategoriesText = {
  label: "Settings categories",
  groups: {
    basics: "Basics",
    features: "Features",
    extensions: "Extensions",
  },
  general: "General",
  appearance: "Appearance",
  shortcuts: "Shortcuts",
  notifications: "Notifications",
  todos: "Todos",
  music: "Music",
  clipboard: "Clipboard",
  translation: "Translation",
  shelf: "File shelf",
  agents: "AI Agent",
  plugins: "Plugins",
  market: "Plugin market",
  about: "About",
};
