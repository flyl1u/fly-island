export type MusicText = {
  plugin: {
    player: string;
    install: string; uninstall: string; confirmRemove: string; retry: string; details: string;
    downloading: string; verifying: string; copying: string; untested: string;
    disclosure: string; license: string; success: string; removed: string; keptForeignLoader: string; preserved: string;
    needsClose: string; userDeclined: string; legacyConflict: string; unsupported: string;
    network: string; hashMismatch: string; busy: string; io: string; openPlugins: string; openFailed: string;
    closeAndRetry: string; restart: string; restarting: string; restarted: string; notice: string;
    states: Record<"none" | "loaderOnly" | "installed" | "foreignLoader" | "unknown", string>;
  };
  estimatedProgress: string;
  calibrateLine: (line: string) => string;
  seekLine: (line: string) => string;
  diagnostics: {
    title: string; dismiss: string; details: string; update: string; empty: string; openFailed: string; kugou: string;
    ok: (player: string) => string;
    needsUpdate: (player: string) => string;
    smtcOff: (player: string) => string;
    neteaseNeedsPlugin: (player: string) => string;
    neteasePluginInactive: (player: string) => string;
    noTimeline: (player: string) => string;
  };
  playerLabel: string;
  controlFailed: string;
  /** The music page with nothing playing: a title and what to do. */
  nothingPlaying: string;
  nothingPlayingHint: string;
  /** The one button with nothing playing: the media key, which wakes the last player. */
  resume: string;
  resumeHint: string;
  lyricsLabel: string;
  /** No lyrics for a Chinese song while only LRCLIB is asked; opens Settings → Music. */
  lyricsChineseHint: { text: string; label: string };
  lyricsOffset: { label: string; earlier: string; later: string; reset: (seconds: number) => string };
  unknownArtist: string;
  previous: string;
  previousTrack: string;
  play: string;
  pause: string;
  next: string;
  nextTrack: string;
  progress: string;
  openSettings: string;
};

export const zhCN: MusicText = {
  plugin: {
    player: "网易云音乐",
    install: "一键启用", uninstall: "卸载", confirmRemove: "确认卸载", retry: "重试", details: "了解详情",
    downloading: "正在下载…", verifying: "正在校验…", copying: "正在安装 / 卸载…", untested: "此版本未经测试",
    disclosure: "把随岛屿附带的开源插件 InfLink-rs 与 BetterNCM（GPL-3.0）校验后放入网易云目录，不用下载，可随时卸载",
    license: "InfLink-rs 与 BetterNCM 均为 GPL-3.0 开源项目，原样随安装包附带（许可证全文在安装目录的 media-plugins 文件夹），安装前按固定指纹校验；源代码见",
    success: "已安装，重启网易云音乐后生效", removed: "已卸载；加载器生成的其他数据保留，可手动清理",
    keptForeignLoader: "检测到已有其他加载器，只安装了插件", preserved: "以下文件已被替换或不属于本次安装，已保留：",
    needsClose: "需要先关闭网易云音乐", userDeclined: "需要管理员权限才能写入网易云目录",
    legacyConflict: "检测到旧版 InfLink，请先删除旧插件再试", unsupported: "当前网易云版本暂不支持：",
    network: "下载失败，请检查网络后重试", hashMismatch: "下载的文件校验未通过，已丢弃，请重试", busy: "另一个安装或卸载正在进行", io: "文件操作失败：",
    openPlugins: "打开插件目录", openFailed: "无法打开链接或目录",
    closeAndRetry: "关闭网易云并继续", restart: "立即重启网易云", restarting: "正在重启网易云…", restarted: "已重启网易云音乐，进度会在播放时同步", notice: "播放器提示",
    states: { none: "未安装插件", loaderOnly: "仅有加载器", installed: "插件已安装", foreignLoader: "已有其他加载器", unknown: "插件状态未知" },
  },
  estimatedProgress: "进度为估算；在播放器里拖动进度后，可点一句歌词校准",
  calibrateLine: (line) => `校准进度到：${line}`,
  seekLine: (line) => `播放到：${line}`,
  diagnostics: {
    title: "播放器兼容性", dismiss: "收起，不再自动弹出", details: "了解详情", update: "打开官网", empty: "未检测到播放器", openFailed: "无法打开链接",
    kugou: "在酷狗的设置 → 常规设置 → 播放 → 支持系统播放控制中开启后即可同步进度",
    ok: () => "进度同步正常",
    needsUpdate: () => "QQ 音乐版本过低，进度无法同步，更新到 21.10.2962 或以上即可",
    smtcOff: (player) => `在${player}设置里打开系统媒体控制后即可同步进度`,
    neteaseNeedsPlugin: () => "网易云需要安装进度插件才能同步进度",
    neteasePluginInactive: () => "插件已安装，请重启网易云；如果重启后仍无进度，可能是当前版本不兼容",
    noTimeline: () => "该播放器不提供进度，歌词按估算显示，可点歌词校准",
  },
  playerLabel: "音乐播放器",
  controlFailed: "控制失败",
  nothingPlaying: "没有在播放",
  nothingPlayingHint: "在任意播放器里放一首歌，就会出现在这里",
  resume: "继续播放",
  resumeHint: "让上次用的播放器接着放",
  lyricsLabel: "歌词",
  lyricsChineseHint: { text: "没找到歌词 · 试试酷狗和网易云", label: "这首歌没找到歌词。打开设置，开启「也查酷狗和网易云」" },
  lyricsOffset: {
    label: "这首歌的歌词快慢",
    earlier: "歌词提前 0.5 秒",
    later: "歌词推后 0.5 秒",
    reset: (seconds) => (seconds === 0 ? "没有调整" : `已${seconds > 0 ? "推后" : "提前"} ${Math.abs(seconds)} 秒，点击恢复`),
  },
  unknownArtist: "未知艺术家",
  previous: "上一首",
  previousTrack: "上一首",
  play: "播放",
  pause: "暂停",
  next: "下一首",
  nextTrack: "下一首",
  progress: "播放进度",
  openSettings: "歌词设置",
};

export const en: MusicText = {
  plugin: {
    player: "NetEase Cloud Music",
    install: "Enable precise progress", uninstall: "Uninstall", confirmRemove: "Confirm uninstall", retry: "Retry", details: "Learn more",
    downloading: "Downloading…", verifying: "Verifying…", copying: "Installing / removing…", untested: "This version is untested",
    disclosure: "Verifies the bundled open-source InfLink-rs and BetterNCM (GPL-3.0) and puts them in NetEase's folders. Nothing to download; you can uninstall at any time.",
    license: "InfLink-rs and BetterNCM are GPL-3.0 projects shipped unmodified with this app (full license text in the media-plugins folder of the install directory) and verified against pinned fingerprints before use. Source code:",
    success: "Installed. Restart NetEase Cloud Music to enable it.", removed: "Uninstalled. Other loader data is retained and can be removed manually.",
    keptForeignLoader: "An existing loader was retained; only the plugin was installed.", preserved: "Replaced or unowned files were retained:",
    needsClose: "NetEase Cloud Music needs to be closed first.", userDeclined: "Administrator permission is needed to write to the NetEase directory.",
    legacyConflict: "An old InfLink plugin was found. Remove it before retrying.", unsupported: "This NetEase version is unsupported:",
    network: "Download failed. Check your connection and retry.", hashMismatch: "The download failed verification and was discarded. Retry.", busy: "Another install or uninstall is running.", io: "File operation failed:",
    openPlugins: "Open plugin folder", openFailed: "Could not open the link or folder",
    closeAndRetry: "Close NetEase and continue", restart: "Restart NetEase now", restarting: "Restarting NetEase…", restarted: "NetEase restarted. Progress syncs once a song plays.", notice: "Player tip",
    states: { none: "Plugin not installed", loaderOnly: "Loader only", installed: "Plugin installed", foreignLoader: "Existing third-party loader", unknown: "Unknown plugin state" },
  },
  estimatedProgress: "Progress is estimated. After seeking in the player, click a lyric line to recalibrate.",
  calibrateLine: (line) => `Recalibrate progress to: ${line}`,
  seekLine: (line) => `Seek to: ${line}`,
  diagnostics: {
    title: "Player compatibility", dismiss: "Hide; don't pop up again", details: "Learn more", update: "Open website", empty: "No players detected", openFailed: "Could not open link",
    kugou: "In Kugou, enable Settings → General settings → Playback → Support system media controls to sync progress.",
    ok: () => "Progress sync is working",
    needsUpdate: () => "QQ Music is too old to sync progress. Update to 21.10.2962 or later.",
    smtcOff: (player) => `Enable system media controls in ${player}'s settings to sync progress.`,
    neteaseNeedsPlugin: () => "NetEase Cloud Music needs a progress plugin to sync progress.",
    neteasePluginInactive: () => "Plugin installed. Restart NetEase; if progress is still unavailable, this version may be incompatible.",
    noTimeline: () => "This player provides no progress. Lyrics use estimated timing; click a line to recalibrate.",
  },
  playerLabel: "Music player",
  controlFailed: "Control failed",
  nothingPlaying: "Nothing playing",
  nothingPlayingHint: "Play a song in any player and it shows up here",
  resume: "Resume",
  resumeHint: "Ask the last player you used to carry on",
  lyricsLabel: "Lyrics",
  lyricsChineseHint: { text: "No lyrics · try Kugou and NetEase", label: "No lyrics found for this song. Open settings to also ask Kugou and NetEase" },
  lyricsOffset: {
    label: "Lyrics timing for this song",
    earlier: "Lyrics 0.5 s earlier",
    later: "Lyrics 0.5 s later",
    reset: (seconds) => (seconds === 0 ? "Not moved" : `Moved ${Math.abs(seconds)} s ${seconds > 0 ? "later" : "earlier"}; click to reset`),
  },
  unknownArtist: "Unknown artist",
  previous: "Previous",
  previousTrack: "Previous track",
  play: "Play",
  pause: "Pause",
  next: "Next",
  nextTrack: "Next track",
  progress: "Playback progress",
  openSettings: "Lyrics settings",
};
