export type MusicText = {
  estimatedProgress: string;
  calibrateLine: (line: string) => string;
  seekLine: (line: string) => string;
  diagnostics: {
    title: string; dismiss: string; details: string; update: string; empty: string; openFailed: string; kugou: string;
    ok: (player: string) => string;
    needsUpdate: (player: string) => string;
    smtcOff: (player: string) => string;
    neteaseNeedsPlugin: (player: string) => string;
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
  estimatedProgress: "进度为估算；在播放器里拖动进度后，可点一句歌词校准",
  calibrateLine: (line) => `校准进度到：${line}`,
  seekLine: (line) => `播放到：${line}`,
  diagnostics: {
    title: "播放器兼容性", dismiss: "不再提示", details: "了解详情", update: "打开官网", empty: "未检测到播放器", openFailed: "无法打开链接",
    kugou: "在酷狗的设置 → 常规设置 → 播放 → 支持系统播放控制中开启后即可同步进度",
    ok: () => "进度同步正常",
    needsUpdate: () => "QQ 音乐版本过低，进度无法同步，更新到 21.10.2962 或以上即可",
    smtcOff: (player) => `在${player}设置里打开系统媒体控制后即可同步进度`,
    neteaseNeedsPlugin: () => "网易云需要安装进度插件才能同步进度",
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
  estimatedProgress: "Progress is estimated. After seeking in the player, click a lyric line to recalibrate.",
  calibrateLine: (line) => `Recalibrate progress to: ${line}`,
  seekLine: (line) => `Seek to: ${line}`,
  diagnostics: {
    title: "Player compatibility", dismiss: "Don't show again", details: "Learn more", update: "Open website", empty: "No players detected", openFailed: "Could not open link",
    kugou: "In Kugou, enable Settings → General settings → Playback → Support system media controls to sync progress.",
    ok: () => "Progress sync is working",
    needsUpdate: () => "QQ Music is too old to sync progress. Update to 21.10.2962 or later.",
    smtcOff: (player) => `Enable system media controls in ${player}'s settings to sync progress.`,
    neteaseNeedsPlugin: () => "NetEase Cloud Music needs a progress plugin to sync progress.",
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
