export type MusicText = {
  playerLabel: string;
  controlFailed: string;
  /** The music page with nothing playing: a title and what to do. */
  nothingPlaying: string;
  nothingPlayingHint: string;
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
  playerLabel: "音乐播放器",
  controlFailed: "控制失败",
  nothingPlaying: "没有在播放",
  nothingPlayingHint: "在任意播放器里放一首歌，这里会显示封面、歌词和播放控制。",
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
  playerLabel: "Music player",
  controlFailed: "Control failed",
  nothingPlaying: "Nothing playing",
  nothingPlayingHint: "Play a song in any player and its cover, lyrics and controls show up here.",
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
