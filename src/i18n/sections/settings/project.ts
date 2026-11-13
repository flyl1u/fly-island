export type SettingsProjectText = {
  title: string;
  appName: string;
  versionChip: (version: string) => string;
  description: string;
  /** The last card of About: resetting every setting, and quitting the island. */
  quit: string;
  quitHint: string;
  quitAction: string;
  /** About: the changelog, built from every version's release notes. */
  changelog: string;
  changelogAll: (count: number) => string;
  changelogLess: string;
  /** The row that opens the WeChat group's code in place; questions and problems go there. */
  community: string;
  communityHint: string;
  /** Read out for the red dot on the row until the group is first opened. */
  communityNew: string;
  communityCodeAlt: string;
  communityScan: string;
  communityLoadFailed: string;
  star: string;
  starHint: string;
  /** The sidebar link to the author's site, under About. */
  author: string;
  /** The row that opens the author's two payment codes in place. */
  support: string;
  supportHint: string;
  supportWechat: string;
  supportAlipay: string;
  supportCodeAlt: (app: string) => string;
  supportThanks: string;
  openFailed: string;
  /** The todo the island adds when a new version is found, and its button. */
  update: {
    downloadingUnknown: string;
    updateTodo: string;
    updateNow: string;
    updateDownloading: (percent: number) => string;
    installing: string;
  };
};

export const zhCN: SettingsProjectText = {
  title: "关于小岛",
  appName: "fly-island",
  versionChip: (version) => `v${version}`,
  description: "在屏幕顶部集中待办、剪贴板、音乐、快捷翻译、AI 状态和消息提醒。",
  quit: "退出岛屿",
  quitHint: "和托盘菜单里的「退出」一样；要再打开，从开始菜单或桌面快捷方式启动。",
  quitAction: "退出",
  changelog: "更新日志",
  changelogAll: (count) => `显示全部 ${count} 个版本`,
  changelogLess: "只看最近几个版本",
  community: "用户交流群",
  communityHint: "遇到问题、想要新功能，都可以来群里问问、聊聊",
  communityNew: "新",
  communityCodeAlt: "fly-island 用户交流群的微信二维码",
  communityScan: "用微信扫一扫加入。二维码每周更新，过期了重新点开这里就是新的。",
  communityLoadFailed: "二维码没加载出来，检查一下网络后再点开试试。",
  star: "觉得小岛还不错？",
  starHint: "去 GitHub 给小岛一颗 Star",
  author: "关于作者",
  support: "打赏作者",
  supportHint: "觉得好用的话，请作者喝杯咖啡",
  supportWechat: "微信",
  supportAlipay: "支付宝",
  supportCodeAlt: (app) => `${app}收款码`,
  supportThanks: "用手机扫一扫，金额随意，谢谢你的支持！",
  openFailed: "暂时没能打开浏览器，请再试一次。",
  update: {
    downloadingUnknown: "正在下载…",
    updateTodo: "检测到新版本",
    updateNow: "更新",
    updateDownloading: (percent) => `下载 ${percent}%`,
    installing: "正在安装，小岛会自动重启",
  },
};

export const en: SettingsProjectText = {
  title: "About the island",
  appName: "fly-island",
  versionChip: (version) => `v${version}`,
  description: "Todos, clipboard, music, quick translation, AI status, and message alerts, gathered at the top of the screen.",
  quit: "Quit the island",
  quitHint: "Same as Quit in the tray menu; start it again from the Start menu or a desktop shortcut.",
  quitAction: "Quit",
  changelog: "Changelog",
  changelogAll: (count) => `Show all ${count} versions`,
  changelogLess: "Show recent versions only",
  community: "Community group",
  communityHint: "Questions, ideas or problems? Come ask and chat in the group",
  communityNew: "New",
  communityCodeAlt: "WeChat QR code of the fly-island community group",
  communityScan: "Scan with WeChat to join. The code changes every week; if it has expired, open this again for the new one.",
  communityLoadFailed: "Couldn't load the QR code. Check your connection and open this again.",
  star: "Enjoying your little island?",
  starHint: "Give it a Star on GitHub",
  author: "About the author",
  support: "Support the author",
  supportHint: "Buy the author a coffee if you like it",
  supportWechat: "WeChat Pay",
  supportAlipay: "Alipay",
  supportCodeAlt: (app) => `${app} payment code`,
  supportThanks: "Scan with your phone. Any amount helps — thank you!",
  openFailed: "Couldn't open your browser. Please try again.",
  update: {
    downloadingUnknown: "Downloading…",
    updateTodo: "New version available",
    updateNow: "Update",
    updateDownloading: (percent) => `Downloading ${percent}%`,
    installing: "Installing — the island will restart itself",
  },
};
