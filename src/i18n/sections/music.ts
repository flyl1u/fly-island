export type MusicText = {
  playerLabel: string;
  controlFailed: string;
  noMedia: string;
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
