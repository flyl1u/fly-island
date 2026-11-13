export type SettingsCategoriesText = {
  label: string;
  groups: {
    basics: string;
    features: string;
    agents: string;
  };
  general: string;
  appearance: string;
  shortcuts: string;
  /** QQ, WeChat and Mail on one page. */
  messages: string;
  /** Mail's group on the Messages page. */
  mail: string;
  todos: string;
  music: string;
  clipboard: string;
  translation: string;
  /** The file shelf's group on the Clipboard page. */
  shelf: string;
  /** The AI Agent group's pages. */
  agents: string;
  agentConnect: string;
  plugins: string;
  about: string;
};

export const zhCN: SettingsCategoriesText = {
  label: "设置分类",
  groups: {
    basics: "基础",
    features: "功能",
    agents: "AI Agent",
  },
  general: "通用",
  appearance: "外观",
  shortcuts: "快捷键",
  messages: "消息",
  mail: "邮箱",
  todos: "待办",
  music: "音乐",
  clipboard: "剪贴板与文件",
  translation: "翻译",
  shelf: "文件中转",
  agents: "AI 会话",
  agentConnect: "接入 AI 工具",
  plugins: "插件",
  about: "关于",
};

export const en: SettingsCategoriesText = {
  label: "Settings categories",
  groups: {
    basics: "Basics",
    features: "Features",
    agents: "AI Agent",
  },
  general: "General",
  appearance: "Appearance",
  shortcuts: "Shortcuts",
  messages: "Messages",
  mail: "Mail",
  todos: "Todos",
  music: "Music",
  clipboard: "Clipboard & files",
  translation: "Translation",
  shelf: "File shelf",
  agents: "AI sessions",
  agentConnect: "Connect AI tools",
  plugins: "Plugins",
  about: "About",
};
