export type SettingsProjectText = {
  title: string;
  appName: string;
  versionChip: (version: string) => string;
  description: string;
  versionTitle: string;
  linksTitle: string;
  releases: string;
  releasesHint: string;
  issues: string;
  issuesHint: string;
  star: string;
  starHint: string;
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
    installing: string;
    done: string;
    error: string;
    errorDetail: (reason: string) => string;
    notesTitle: (version: string) => string;
    unavailable: string;
    channel: string;
    channelStable: string;
    channelBeta: string;
    channelStableHint: string;
    channelBetaHint: string;
    openPage: string;
    openPageHint: string;
    skip: string;
    unskip: string;
    skipHint: string;
    skipped: (version: string) => string;
    autoTitle: string;
    autoCheck: string;
    autoCheckHint: string;
    lastChecked: (time: string) => string;
    neverChecked: string;
    islandReminder: (version: string) => string;
  };
};

export const zhCN: SettingsProjectText = {
  title: "关于小岛",
  appName: "fly-island",
  versionChip: (version) => `v${version}`,
  description: "在屏幕顶部集中待办、剪贴板、音乐、快捷翻译、AI 状态和消息提醒。",
  versionTitle: "版本",
  linksTitle: "链接",
  releases: "版本发布",
  releasesHint: "查看更新说明，或手动下载安装包",
  issues: "反馈问题",
  issuesHint: "到 GitHub 提一个 Issue",
  star: "觉得小岛还不错？",
  starHint: "去 GitHub 给小岛一颗 Star",
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
    installing: "正在安装，小岛会自动重启",
    done: "更新完成，小岛正在重启…",
    error: "检查更新失败，请稍后再试。",
    errorDetail: (reason) => `原因：${reason}`,
    notesTitle: (version) => `v${version} 更新内容`,
    unavailable: "这里不能应用内更新，请到 Release 页手动下载。",
    channel: "更新通道",
    channelStable: "稳定版",
    channelBeta: "测试版（beta）",
    channelStableHint: "只接收正式版本",
    channelBetaHint: "提前体验新功能，也会收到正式版本；可能不太稳定",
    openPage: "检查更新",
    openPageHint: "在「更新」页检查新版本、选择更新通道",
    skip: "跳过这个版本",
    unskip: "取消跳过",
    skipHint: "不想装这个版本？跳过后岛上不再提醒，以后的新版本照常提醒",
    skipped: (version) => `已跳过 v${version}，岛上不再提醒；仍可在这里手动安装`,
    autoTitle: "自动检查",
    autoCheck: "自动检查更新",
    autoCheckHint: "启动后和之后每 6 小时检查一次；发现新版本时，岛上的设置按钮会出现小圆点",
    lastChecked: (time) => `上次检查：${time}`,
    neverChecked: "还没有检查过",
    islandReminder: (version) => `发现新版本 v${version}，点击查看`,
  },
};

export const en: SettingsProjectText = {
  title: "About the island",
  appName: "fly-island",
  versionChip: (version) => `v${version}`,
  description: "Todos, clipboard, music, quick translation, AI status, and message alerts, gathered at the top of the screen.",
  versionTitle: "Version",
  linksTitle: "Links",
  releases: "Releases",
  releasesHint: "Read the notes, or download a build by hand",
  issues: "Report a problem",
  issuesHint: "Open an issue on GitHub",
  star: "Enjoying your little island?",
  starHint: "Give it a Star on GitHub",
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
    installing: "Installing — the island will restart itself",
    done: "Update installed, restarting…",
    error: "Couldn't check for updates. Please try again later.",
    errorDetail: (reason) => `Reason: ${reason}`,
    notesTitle: (version) => `What's new in v${version}`,
    unavailable: "In-app updates aren't available here. Grab new versions from the release page.",
    channel: "Update channel",
    channelStable: "Stable",
    channelBeta: "Beta",
    channelStableHint: "Only final releases",
    channelBetaHint: "Try new features early, and still get final releases; may be less stable",
    openPage: "Check for updates",
    openPageHint: "Check for new versions and pick an update channel on the Updates page",
    skip: "Skip this version",
    unskip: "Don't skip",
    skipHint: "Not this one? Skipping stops the island's reminder for it; later versions still remind you",
    skipped: (version) => `v${version} is skipped, so the island won't remind you. You can still install it here`,
    autoTitle: "Automatic checks",
    autoCheck: "Check for updates automatically",
    autoCheckHint: "At startup and every 6 hours after. When a new version is out, the island's settings button shows a dot",
    lastChecked: (time) => `Last checked: ${time}`,
    neverChecked: "Not checked yet",
    islandReminder: (version) => `Version v${version} is available. Click to see it`,
  },
};
