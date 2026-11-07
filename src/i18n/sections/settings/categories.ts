export type SettingsCategoriesText = {
  label: string;
  groups: {
    basics: string;
    features: string;
    agents: string;
    extensions: string;
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
  shelf: string;
  calendar: string;
  /** The AI Agent group's pages. */
  agents: string;
  agentAlerts: string;
  sounds: string;
  agentApprovals: string;
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
    extensions: "扩展",
  },
  general: "通用",
  appearance: "外观",
  shortcuts: "快捷键",
  messages: "消息",
  mail: "邮箱",
  todos: "待办",
  music: "音乐",
  clipboard: "剪贴板",
  translation: "翻译",
  shelf: "文件中转",
  calendar: "日历",
  agents: "会话",
  agentAlerts: "提醒",
  sounds: "声音",
  agentApprovals: "审批",
  agentConnect: "连接",
  plugins: "插件",
  about: "关于",
};

export const en: SettingsCategoriesText = {
  label: "Settings categories",
  groups: {
    basics: "Basics",
    features: "Features",
    agents: "AI Agent",
    extensions: "Extensions",
  },
  general: "General",
  appearance: "Appearance",
  shortcuts: "Shortcuts",
  messages: "Messages",
  mail: "Mail",
  todos: "Todos",
  music: "Music",
  clipboard: "Clipboard",
  translation: "Translation",
  shelf: "File shelf",
  calendar: "Calendar",
  agents: "Sessions",
  agentAlerts: "Alerts",
  sounds: "Sounds",
  agentApprovals: "Approvals",
  agentConnect: "Connection",
  plugins: "Plugins",
  about: "About",
};
