export type SettingsMusicSourcesText = {
  title: string;
  footer: string;
  /** Why a cover may be missing: the player does not hand it to Windows. */
  coverHint: string;
  empty: string;
  playing: string;
  open: string;
  notOpen: string;
  moveLabel: (name: string) => string;
  /** The row button that takes a player out of the order, for players the user never uses. */
  archive: string;
  /** The row button in the archive that puts a player back at the end of the order. */
  restore: string;
  archivedTitle: string;
  archivedHint: string;
};

export const zhCN: SettingsMusicSourcesText = {
  title: "播放器顺序",
  footer: "几个播放器同时在放时，岛显示排在前面的那个；都没在放时，显示排在前面的已打开的播放器。拖动调整顺序。",
  coverHint: "不显示封面？请在播放器的设置里打开 SMTC（系统媒体控制）。",
  empty: "还没发现播放器。放一首歌，它就会出现在这里。",
  playing: "正在播放",
  open: "已打开",
  notOpen: "没有打开",
  moveLabel: (name) => `调整"${name}"的顺序，可以拖动或按上下方向键`,
  archive: "归档",
  restore: "恢复",
  archivedTitle: "已归档",
  archivedHint: "归档的播放器不再出现在顺序里，岛也不再跟随它；点「恢复」放回顺序末尾。",
};

export const en: SettingsMusicSourcesText = {
  title: "Player order",
  footer: "When several players are playing, the island shows the first; when none is, the first one that is open. Drag to reorder.",
  coverHint: "No cover art? Turn on SMTC (System Media Transport Controls) in the player's own settings.",
  empty: "No players found yet. Play a song and it shows up here.",
  playing: "Playing",
  open: "Open",
  notOpen: "Not open",
  moveLabel: (name) => `Reorder "${name}": drag, or press the up and down arrow keys`,
  archive: "Archive",
  restore: "Restore",
  archivedTitle: "Archived",
  archivedHint: "Archived players leave the order above and the island no longer follows them. Restore one to put it back at the end.",
};
