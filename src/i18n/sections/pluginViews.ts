export type PluginViewsText = {
  pageLabel: (title: string, plugin: string) => string;
  waiting: string;
  starting: string;
  stopped: string;
  restart: string;
  empty: string;
  search: string;
  loading: string;
  actions: string;
  submit: string;
  submitted: string;
  /** Settings → plugins: which plugin pages the island shows, in what order. */
  pagesSettings: { title: string; hint: string; empty: string; show: string; moveUp: string; moveDown: string };
};

export const zhCN: PluginViewsText = {
  pageLabel: (title, plugin) => `${title}（${plugin}）`,
  waiting: "等待插件发来内容…",
  starting: "插件正在启动…",
  stopped: "插件已停止",
  restart: "重新启动",
  empty: "这里还没有内容",
  search: "搜索",
  loading: "加载中…",
  actions: "操作",
  submit: "提交",
  submitted: "已提交",
  pagesSettings: {
    title: "岛上页面",
    hint: "插件加到岛上的页面排在内置页面之后，这里的顺序也是它们的数字快捷键顺序。只列出已启用插件的页面。",
    empty: "已启用的插件还没有添加页面。",
    show: "显示",
    moveUp: "上移",
    moveDown: "下移",
  },
};

export const en: PluginViewsText = {
  pageLabel: (title, plugin) => `${title} (${plugin})`,
  waiting: "Waiting for the plugin…",
  starting: "The plugin is starting…",
  stopped: "The plugin has stopped",
  restart: "Restart",
  empty: "Nothing here yet",
  search: "Search",
  loading: "Loading…",
  actions: "Actions",
  submit: "Submit",
  submitted: "Sent",
  pagesSettings: {
    title: "Island pages",
    hint: "Pages plugins add come after the built-in pages; this order is also their number shortcut order. Only plugins that are on are listed.",
    empty: "No plugin that is on has added a page yet.",
    show: "Show",
    moveUp: "Move up",
    moveDown: "Move down",
  },
};
