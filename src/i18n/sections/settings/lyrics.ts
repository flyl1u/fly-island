export type SettingsLyricsText = {
  title: string;
  hint: string;
  folder: string;
  folderHint: string;
  folderPlaceholder: string;
  online: string;
  onlineHint: string;
  chinese: string;
  chineseHint: string;
  offset: string;
  offsetHint: string;
  offsetValue: (ms: number) => string;
  offsetReset: string;
};

export const zhCN: SettingsLyricsText = {
  title: "歌词",
  hint: "找到带时间轴的歌词时，音乐页在波形上方显示滚动歌词。先找本地文件夹，再查在线歌词库。某首歌对不上时，可以在音乐页右上角单独调它的快慢。",
  folder: "本地歌词文件夹",
  folderHint: "放 .lrc 文件，文件名写成「歌手 - 歌名」「歌名 - 歌手」或「歌名」。只找这一层，不找子文件夹。",
  folderPlaceholder: "例如 D:\\Music\\Lyrics",
  online: "在线查找歌词",
  onlineHint: "本地找不到时查 LRCLIB（lrclib.net，免费开源的歌词库），会把歌名、歌手、专辑和时长发过去。每首歌只查一次，结果存在本机。中文歌收录较少。",
  chinese: "也查酷狗和网易云",
  chineseHint: "中文歌收录多，有翻译。这两个是非官方接口，可能随时失效；会把歌名、歌手和时长发给它们。装了网易云的 InfLink 插件时按歌曲直接查，更准。",
  offset: "歌词提前或推后",
  offsetHint: "歌词比歌声快就往右调，慢就往左调。",
  offsetValue: (ms) => (ms === 0 ? "0 秒" : `${ms > 0 ? "推后" : "提前"} ${Math.abs(ms) / 1000} 秒`),
  offsetReset: "恢复为 0",
};

export const en: SettingsLyricsText = {
  title: "Lyrics",
  hint: "When synced lyrics are found, the music page scrolls them above the waveform. Your folder is searched first, then the online lyrics library. A song that runs out of step can be moved on its own at the music page's top right.",
  folder: "Lyrics folder",
  folderHint: "Holds .lrc files named \"Artist - Title\", \"Title - Artist\" or \"Title\". Subfolders are not searched.",
  folderPlaceholder: "For example D:\\Music\\Lyrics",
  online: "Find lyrics online",
  onlineHint: "When the folder has none, asks LRCLIB (lrclib.net, a free and open lyrics library), sending the title, artist, album and length. Each song is asked about once and the answer is kept on this computer.",
  chinese: "Also ask Kugou and NetEase",
  chineseHint: "Many more Chinese songs, with translations. These are unofficial interfaces that may stop working at any time; the title, artist and length are sent to them. With NetEase's InfLink plugin the song is looked up by its id, which is more exact.",
  offset: "Lyrics earlier or later",
  offsetHint: "Move right if the lyrics run ahead of the singing, left if they lag.",
  offsetValue: (ms) => (ms === 0 ? "0 s" : `${Math.abs(ms) / 1000} s ${ms > 0 ? "later" : "earlier"}`),
  offsetReset: "Reset to 0",
};
