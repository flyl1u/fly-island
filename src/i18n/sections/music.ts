export type MusicText = {
  playerLabel: string;
  controlFailed: string;
  noMedia: string;
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
  shuffle: string;
  repeatOne: string;
  repeatAll: string;
  repeatOff: string;
  seek: string;
  settingsTitle: string;
  settingsHint: string;
  openSettings: string;
  closeSettings: string;
  reorderSource: string;
  removeSource: string;
  noSources: string;
};

export const zhCN: MusicText = {
  playerLabel: "音乐播放器",
  controlFailed: "控制失败",
  noMedia: "暂无媒体",
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
  shuffle: "随机播放",
  repeatOne: "单曲循环",
  repeatAll: "列表循环",
  repeatOff: "关闭循环",
  seek: "调整进度",
  settingsTitle: "来源优先级",
  settingsHint: "拖动排序，悬浮岛会优先跟随靠前且正在播放的来源。",
  openSettings: "来源设置",
  closeSettings: "返回播放器",
  reorderSource: "调整来源顺序",
  removeSource: "移除来源",
  noSources: "尚未检测到音频来源。",
};

export const en: MusicText = {
  playerLabel: "Music player",
  controlFailed: "Control failed",
  noMedia: "No media",
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
  shuffle: "Shuffle",
  repeatOne: "Repeat one",
  repeatAll: "Repeat all",
  repeatOff: "Repeat off",
  seek: "Seek",
  settingsTitle: "Source priority",
  settingsHint: "Drag to reorder. The island follows the highest source that is playing.",
  openSettings: "Source settings",
  closeSettings: "Back to player",
  reorderSource: "Reorder source",
  removeSource: "Remove source",
  noSources: "No audio sources detected yet.",
};
