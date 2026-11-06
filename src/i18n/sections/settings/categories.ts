export type SettingsCategoriesText = {
  label: string;
  groups: {
    basics: string;
    features: string;
    messages: string;
    extensions: string;
  };
  general: string;
  appearance: string;
  shortcuts: string;
  updates: string;
  qq: string;
  wechat: string;
  mail: string;
  todos: string;
  music: string;
  clipboard: string;
  translation: string;
  shelf: string;
  agents: string;
  sounds: string;
  plugins: string;
  market: string;
  about: string;
};

export const zhCN: SettingsCategoriesText = {
  label: "设置分类",
  groups: {
    basics: "基础",
    features: "功能",
    messages: "消息",
    extensions: "扩展",
  },
  general: "通用",
  appearance: "外观",
  shortcuts: "快捷键",
  updates: "更新",
  qq: "QQ 通知",
  wechat: "微信提醒",
  mail: "邮箱",
  todos: "待办",
  music: "音乐",
  clipboard: "剪贴板",
  translation: "翻译",
  shelf: "文件中转",
  agents: "AI Agent",
  sounds: "声音",
  plugins: "插件扩展",
  market: "插件市场",
  about: "关于",
};

export const en: SettingsCategoriesText = {
  label: "Settings categories",
  groups: {
    basics: "Basics",
    features: "Features",
    messages: "Messages",
    extensions: "Extensions",
  },
  general: "General",
  appearance: "Appearance",
  shortcuts: "Shortcuts",
  updates: "Updates",
  qq: "QQ notifications",
  wechat: "WeChat reminders",
  mail: "Mail",
  todos: "Todos",
  music: "Music",
  clipboard: "Clipboard",
  translation: "Translation",
  shelf: "File shelf",
  agents: "AI Agent",
  sounds: "Sounds",
  plugins: "Plugins",
  market: "Plugin market",
  about: "About",
};
