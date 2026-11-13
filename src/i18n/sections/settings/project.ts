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
  releases: string;
  releasesHint: string;
  issues: string;
  issuesHint: string;
  star: string;
  starHint: string;
  author: string;
  authorHint: string;
  /** The row that opens the author's two payment codes in place. */
  support: string;
  supportHint: string;
  supportWechat: string;
  supportAlipay: string;
  supportCodeAlt: (app: string) => string;
  supportThanks: string;
  latestRelease: string;
  latestReleaseHint: string;
  openFailed: string;
  update: {
    title: string;
    hint: string;
    versionLabel: (version: string) => string;
    check: string;
    checking: string;
    upToDate: (version: string) => string;
    available: (version: string) => string;
    download: string;
    downloading: (percent: number) => string;
    downloadingUnknown: string;
    ready: (version: string) => string;
    restart: string;
    /** The todo the island adds when a new version is found. */
    updateTodo: string;
    updateNow: string;
    updateDownloading: (percent: number) => string;
    installing: string;
    done: string;
    error: string;
    errorDetail: (reason: string) => string;
    unavailable: string;
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
  releases: "历史版本",
  releasesHint: "点击之后可以查看岛屿的历史版本和更新历史",
  issues: "反馈问题",
  issuesHint: "到 GitHub 提一个 Issue",
  star: "觉得小岛还不错？",
  starHint: "去 GitHub 给小岛一颗 Star",
  author: "关于作者",
  authorHint: "去作者的个人网站 flyliu.org 看看",
  support: "打赏作者",
  supportHint: "觉得好用的话，请作者喝杯咖啡",
  supportWechat: "微信",
  supportAlipay: "支付宝",
  supportCodeAlt: (app) => `${app}收款码`,
  supportThanks: "用手机扫一扫，金额随意，谢谢你的支持！",
  latestRelease: "查看最新版本",
  latestReleaseHint: "看看小岛又长了什么新本领",
  openFailed: "暂时没能打开浏览器，请再试一次。",
  update: {
    title: "检查更新",
    hint: "点一下看看有没有新版本",
    versionLabel: (version) => `当前版本 v${version}`,
    check: "检查",
    checking: "正在检查更新…",
    upToDate: (version) => `已是最新版本 v${version}`,
    available: (version) => `发现新版本 v${version}`,
    download: "下载并安装",
    downloading: (percent) => `正在下载 ${percent}%`,
    downloadingUnknown: "正在下载…",
    ready: (version) => `新版本 v${version} 已下载`,
    restart: "重启更新",
    updateTodo: "检测到新版本",
    updateNow: "更新",
    updateDownloading: (percent) => `下载 ${percent}%`,
    installing: "正在安装，小岛会自动重启",
    done: "更新完成，小岛正在重启…",
    error: "检查更新失败，请稍后再试。",
    errorDetail: (reason) => `原因：${reason}`,
    unavailable: "这里不能应用内更新，请到 Release 页手动下载。",
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
  releases: "History",
  releasesHint: "See the island's past versions and update history",
  issues: "Report a problem",
  issuesHint: "Open an issue on GitHub",
  star: "Enjoying your little island?",
  starHint: "Give it a Star on GitHub",
  author: "About the author",
  authorHint: "Visit the author's site, flyliu.org",
  support: "Support the author",
  supportHint: "Buy the author a coffee if you like it",
  supportWechat: "WeChat Pay",
  supportAlipay: "Alipay",
  supportCodeAlt: (app) => `${app} payment code`,
  supportThanks: "Scan with your phone. Any amount helps — thank you!",
  latestRelease: "View latest release",
  latestReleaseHint: "See what washed ashore in the latest update",
  openFailed: "Couldn't open your browser. Please try again.",
  update: {
    title: "Check for updates",
    hint: "See whether a newer island washed ashore",
    versionLabel: (version) => `Version v${version}`,
    check: "Check",
    checking: "Checking for updates…",
    upToDate: (version) => `Already on the latest version v${version}`,
    available: (version) => `Version v${version} is available`,
    download: "Download & install",
    downloading: (percent) => `Downloading ${percent}%`,
    downloadingUnknown: "Downloading…",
    ready: (version) => `Version v${version} is downloaded`,
    restart: "Restart & update",
    updateTodo: "New version available",
    updateNow: "Update",
    updateDownloading: (percent) => `Downloading ${percent}%`,
    installing: "Installing — the island will restart itself",
    done: "Update installed, restarting…",
    error: "Couldn't check for updates. Please try again later.",
    errorDetail: (reason) => `Reason: ${reason}`,
    unavailable: "In-app updates aren't available here. Grab new versions from the release page.",
  },
};
