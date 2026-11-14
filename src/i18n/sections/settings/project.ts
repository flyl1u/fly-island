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
    availableHint: string;
    updateDownloading: (percent: number) => string;
    installing: string;
  };
  /** About → the updates group: the automatic-update switch, the status, and checking by hand. */
  autoUpdate: {
    title: string;
    hint: string;
    status: string;
    check: string;
    installNow: string;
    readyTitle: (version: string) => string;
    readyHint: string;
    idle: string;
    checking: string;
    latest: string;
    available: (version: string) => string;
    downloading: (version: string, percent: number | null) => string;
    ready: (version: string) => string;
    installing: string;
    done: string;
    error: (reason: string) => string;
    disabled: string;
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
    availableHint: "有新版本",
    updateDownloading: (percent) => `下载 ${percent}%`,
    installing: "正在安装，小岛会自动重启",
  },
  autoUpdate: {
    title: "自动更新",
    hint: "每 6 小时检查一次，后台下载；小岛收起且 2 分钟没人碰时自动安装并重启。关闭后只在这里手动检查。",
    status: "检查更新",
    check: "检查更新",
    installNow: "立即安装",
    readyTitle: (version) => `v${version} 已下载`,
    readyHint: "安装时小岛会关闭，装完自动重新打开。",
    idle: "还没有检查过",
    checking: "正在检查…",
    latest: "已是最新版本",
    available: (version) => `发现新版本 v${version}`,
    downloading: (version, percent) => percent === null ? `正在下载 v${version}…` : `正在下载 v${version}… ${percent}%`,
    ready: (version) => `v${version} 已下载，可以安装`,
    installing: "正在安装，小岛会自动重启",
    done: "安装程序已启动",
    error: (reason) => `出错了：${reason}`,
    disabled: "这个版本不能应用内更新",
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
    availableHint: "Update available",
    updateDownloading: (percent) => `Downloading ${percent}%`,
    installing: "Installing — the island will restart itself",
  },
  autoUpdate: {
    title: "Automatic updates",
    hint: "Checks every 6 hours and downloads in the background; installs and restarts once the island is collapsed and untouched for 2 minutes. When off, check here by hand.",
    status: "Check for updates",
    check: "Check now",
    installNow: "Install now",
    readyTitle: (version) => `v${version} downloaded`,
    readyHint: "The island closes while installing and reopens afterwards.",
    idle: "Not checked yet",
    checking: "Checking…",
    latest: "You're up to date",
    available: (version) => `New version v${version} found`,
    downloading: (version, percent) => percent === null ? `Downloading v${version}…` : `Downloading v${version}… ${percent}%`,
    ready: (version) => `v${version} is downloaded and ready to install`,
    installing: "Installing — the island will restart itself",
    done: "The installer has started",
    error: (reason) => `Something went wrong: ${reason}`,
    disabled: "This build can't update itself",
  },
};
