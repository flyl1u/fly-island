export type SettingsLyricsText = {
  title: string;
  hint: string;
  online: string;
  onlineHint: string;
  chinese: string;
  chineseHint: string;
  wordFill: string;
  appleMusic: string;
  appleMusicHint: string;
  appleMusicEnable: string;
  appleMusicToken: string;
  appleMusicTokenHint: string;
  appleMusicTokenPlaceholder: string;
  appleMusicSave: string;
  appleMusicTokenSaved: string;
  appleMusicTokenMissing: string;
};

export const zhCN: SettingsLyricsText = {
  wordFill: "逐字歌词填充",
  title: "歌词",
  hint: "找到带时间轴的歌词时，音乐页会跟着播放滚动显示。某首歌的歌词对不上时，可以在音乐页上单独调它的快慢。",
  online: "在线查找歌词",
  onlineHint: "查 LRCLIB（lrclib.net，免费开源的歌词库），会把歌名、歌手、专辑和时长发过去。每首歌只查一次，结果存在本机。中文歌收录较少。",
  chinese: "也查 QQ 音乐、酷狗和网易云",
  chineseHint: "优先匹配当前播放器，支持逐字歌词与翻译。在线接口为非官方接口，会发送歌名、歌手和时长；酷狗与汽水的本机歌词缓存仅只读访问。",
  appleMusic: "Apple Music 官方歌词",
  appleMusicHint: "开启后，Apple Music 正在播放的歌曲会在音乐页显示 Apple 官方的逐字歌词。",
  appleMusicEnable: "启用 Apple Music 歌词",
  appleMusicToken: "媒体用户令牌（media-user-token）",
  appleMusicTokenHint: "令牌来自 Apple Music 网页版：在浏览器登录 music.apple.com，打开开发者工具的控制台，输入 document.cookie，在结果里找到 media-user-token= 后面的一段（到分号为止），粘贴到上面的框里保存。令牌由 Windows 凭据管理器保管，不会写进小岛的设置。",
  appleMusicTokenPlaceholder: "media-user-token",
  appleMusicSave: "保存",
  appleMusicTokenSaved: "令牌已保存在本机的凭据管理器里。",
  appleMusicTokenMissing: "还没有保存令牌。",
};

export const en: SettingsLyricsText = {
  wordFill: "Word-by-word lyric fill",
  title: "Lyrics",
  hint: "When synced lyrics are found, the music page scrolls them along with the song. A song whose lyrics run out of step can be moved on its own on the music page.",
  online: "Find lyrics online",
  onlineHint: "Asks LRCLIB (lrclib.net, a free and open lyrics library), sending the title, artist, album and length. Each song is asked about once and the answer is kept on this computer.",
  chinese: "Also ask QQ Music, Kugou and NetEase",
  chineseHint: "Prefers the current player, with word timing and translations. Unofficial online interfaces receive the title, artist and length. Native Kugou and Soda lyric caches are accessed read-only.",
  appleMusic: "Apple Music official lyrics",
  appleMusicHint: "When on, a song playing in Apple Music shows Apple's own word-timed lyrics on the music page.",
  appleMusicEnable: "Enable Apple Music lyrics",
  appleMusicToken: "Media user token (media-user-token)",
  appleMusicTokenHint: "The token comes from the Apple Music web player: sign in to music.apple.com in a browser, open the developer tools' console, type document.cookie and copy the part after media-user-token= (up to the next semicolon) into the box above. The token is kept by the Windows credential manager, never in the island's settings.",
  appleMusicTokenPlaceholder: "media-user-token",
  appleMusicSave: "Save",
  appleMusicTokenSaved: "The token is saved in this computer's credential manager.",
  appleMusicTokenMissing: "No token saved yet.",
};
