export type PluginPanelText = {
  /** Nothing published yet: the process is starting or still gathering its first reading. */
  waiting: string;
  /** A panel with no entries. */
  empty: string;
  failed: string;
};

export const zhCN: PluginPanelText = {
  waiting: "插件还没有上报内容。",
  empty: "这里暂时是空的。",
  failed: "操作没有成功",
};

export const en: PluginPanelText = {
  waiting: "The plugin has not reported anything yet.",
  empty: "Nothing here yet.",
  failed: "The action failed",
};
