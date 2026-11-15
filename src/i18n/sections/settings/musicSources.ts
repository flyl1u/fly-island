export type SettingsMusicSourcesText = {
  title: string;
  footer: string;
  /** Why a cover may be missing: the player does not hand it to Windows. */
  coverHint: string;
  empty: string;
  playing: string;
  open: string;
  notOpen: string;
  adopt: string;
  ignored: string;
  audioSource: string;
  moveLabel: (name: string) => string;
  /** The row button that takes a player out of the order, for players the user never uses. */
  archive: string;
  /** The row button in the archive that puts a player back at the end of the order. */
  restore: string;
  archivedTitle: string;
  archivedHint: string;
};

export const zhCN: SettingsMusicSourcesText = {
  title: "播放器采纳与顺序",
  footer: "自动发现系统媒体播放器和已建立音频会话的软件。关闭“采纳”后，岛不会显示或控制该来源。多个来源播放时按此顺序选择，拖动可调整；选择会自动保存。",
  coverHint: "支持 SMTC（系统媒体控制）的播放器可提供曲目信息和播放控制；普通音频来源仅支持应用静音 / 恢复声音，不会暂停播放进度。尚未建立音频会话的软件会在首次播放后出现。",
  empty: "还没发现音频来源。在任意软件里播放声音，它就会出现在这里。",
  playing: "正在播放",
  open: "已打开",
  notOpen: "没有打开",
  adopt: "采纳",
  ignored: "不采纳",
  audioSource: "仅音频 · 静音 / 恢复",
  moveLabel: (name) => `调整"${name}"的顺序，可以拖动或按上下方向键`,
  archive: "归档",
  restore: "恢复",
  archivedTitle: "已归档",
  archivedHint: "归档的播放器不再出现在顺序里，岛也不再跟随它；点「恢复」放回顺序末尾。",
};

export const en: SettingsMusicSourcesText = {
  title: "Adopted players and order",
  footer: "Discovers system media players and applications with audio sessions. Turn off Adopt to exclude a source from display and control. Playing sources follow this order; drag to reorder. Choices are saved automatically.",
  coverHint: "SMTC players provide track information and playback controls. Audio-only sources support application mute / restore, which does not pause playback. Applications appear after first opening an audio stream.",
  empty: "No audio sources found yet. Play sound in an application to discover it.",
  playing: "Playing",
  open: "Open",
  notOpen: "Not open",
  adopt: "Adopt",
  ignored: "Excluded",
  audioSource: "Audio only · mute / restore",
  moveLabel: (name) => `Reorder "${name}": drag, or press the up and down arrow keys`,
  archive: "Archive",
  restore: "Restore",
  archivedTitle: "Archived",
  archivedHint: "Archived players leave the order above and the island no longer follows them. Restore one to put it back at the end.",
};
