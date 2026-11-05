export type SettingsModulesText = {
  title: string;
  hint: string;
  todo: string;
  music: string;
  agents: string;
  mail: string;
  shelf: string;
  translation: string;
  clipboard: string;
};

export const zhCN: SettingsModulesText = {
  title: "功能开关",
  hint: "关闭后，岛上不再显示这个功能的入口，后台也停止运行；已有数据会保留。",
  todo: "启用待办",
  music: "启用音乐控制",
  agents: "启用 AI Agent 状态灯",
  mail: "邮箱",
  shelf: "启用文件中转",
  translation: "启用快捷翻译",
  clipboard: "启用剪贴板历史",
};

export const en: SettingsModulesText = {
  title: "Module",
  hint: "When off, the island hides this module and stops its background work. Your data is kept.",
  todo: "Enable todos",
  music: "Enable music controls",
  agents: "Enable the AI Agent status light",
  mail: "Mail",
  shelf: "Enable the file shelf",
  translation: "Enable quick translation",
  clipboard: "Enable clipboard history",
};
