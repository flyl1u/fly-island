export type SettingsLyricsText = {
  title: string;
  hint: string;
  online: string;
  onlineHint: string;
  chinese: string;
  chineseHint: string;
  wordFill: string;
};

export const zhCN: SettingsLyricsText = {
  wordFill: "逐字歌词填充",
  title: "歌词",
  hint: "找到带时间轴的歌词时，音乐页会跟着播放滚动显示。某首歌的歌词对不上时，可以在音乐页上单独调它的快慢。",
  online: "在线查找歌词",
  onlineHint: "查 LRCLIB（lrclib.net，免费开源的歌词库），会把歌名、歌手、专辑和时长发过去。每首歌只查一次，结果存在本机。中文歌收录较少。",
  chinese: "也查 QQ 音乐、酷狗和网易云",
  chineseHint: "优先匹配当前播放器，支持逐字歌词与翻译。在线接口为非官方接口，会发送歌名、歌手和时长；酷狗与汽水的本机歌词缓存仅只读访问。",
};

export const en: SettingsLyricsText = {
  wordFill: "Word-by-word lyric fill",
  title: "Lyrics",
  hint: "When synced lyrics are found, the music page scrolls them along with the song. A song whose lyrics run out of step can be moved on its own on the music page.",
  online: "Find lyrics online",
  onlineHint: "Asks LRCLIB (lrclib.net, a free and open lyrics library), sending the title, artist, album and length. Each song is asked about once and the answer is kept on this computer.",
  chinese: "Also ask QQ Music, Kugou and NetEase",
  chineseHint: "Prefers the current player, with word timing and translations. Unofficial online interfaces receive the title, artist and length. Native Kugou and Soda lyric caches are accessed read-only.",
};
