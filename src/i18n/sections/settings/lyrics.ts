export type SettingsLyricsText = {
  title: string;
  hint: string;
  online: string;
  onlineHint: string;
  chinese: string;
  chineseHint: string;
  wordFill: string;
  lxPort: string;
  lxPortHint: string;
  appleMusic: string;
  appleMusicHint: string;
  appleMusicEnable: string;
  appleMusicToken: string;
  appleMusicTokenHint: string;
  appleMusicTokenPlaceholder: string;
  appleMusicSave: string;
  appleMusicClearTitle: string;
  appleMusicClear: string;
  appleMusicTokenSaved: string;
  appleMusicTokenMissing: string;
  appleMusicTokenFailed: string;
};

export const zhCN: SettingsLyricsText = {
  wordFill: "逐字歌词填充",
  lxPort: "LX Music 本地接口端口",
  lxPortHint: "LX Music（落雪音乐）播放时，直接读取它本机开放接口里的歌词和翻译，不需要在线查找，也不发送任何数据。端口在 LX 的「设置 → 开放 API」里查看，默认 23330。",
  title: "歌词",
  hint: "找到带时间轴的歌词时，音乐页会跟着播放滚动显示。某首歌的歌词对不上时，可以在音乐页上单独调它的快慢。",
  online: "在线查找歌词",
  onlineHint: "查 LRCLIB（lrclib.net，免费开源的歌词库），会把歌名、歌手、专辑和时长发过去。每首歌只查一次，结果存在本机。中文歌收录较少。",
  chinese: "也查 QQ 音乐、酷狗和网易云",
  chineseHint: "优先匹配当前播放器，支持逐字歌词与翻译。在线接口为非官方接口，会发送歌名、歌手和时长；酷狗与汽水的本机歌词缓存仅只读访问。",
  appleMusic: "Apple Music 官方歌词",
  appleMusicHint: "需同时开启在线查找歌词。Apple Music 播放的歌曲会请求 Apple 官方逐字歌词，并向 Apple 发送歌曲信息和媒体令牌。",
  appleMusicEnable: "启用 Apple Music 歌词",
  appleMusicToken: "媒体用户令牌（media-user-token）",
  appleMusicTokenHint: "令牌来自 Apple Music 网页版：在浏览器登录 music.apple.com，按 F12 打开开发者工作台，切到「网络」面板并刷新页面，把过滤条件选成 JS，找一个名字是 p-*.js、状态是 304 的文件，在它的 cookie 里找到 media-user-token，复制「=」之后到第一个分号之间的那段字符串，粘贴到上面的框里保存。令牌由 Windows 凭据管理器保管，不会写进小岛的设置。",
  appleMusicTokenPlaceholder: "media-user-token",
  appleMusicSave: "保存",
  appleMusicClearTitle: "已保存的令牌",
  appleMusicClear: "清除令牌",
  appleMusicTokenSaved: "令牌已保存在本机的凭据管理器里。",
  appleMusicTokenMissing: "还没有保存令牌。",
  appleMusicTokenFailed: "无法读写本机凭据管理器，请重试。",
};

export const en: SettingsLyricsText = {
  wordFill: "Word-by-word lyric fill",
  lxPort: "LX Music local API port",
  lxPortHint: "When LX Music plays, its own local open-api serves the lyrics and translation it displays — no online lookup and nothing sent. The port is in LX Music's Settings → Open API; the default is 23330.",
  title: "Lyrics",
  hint: "When synced lyrics are found, the music page scrolls them along with the song. A song whose lyrics run out of step can be moved on its own on the music page.",
  online: "Find lyrics online",
  onlineHint: "Asks LRCLIB (lrclib.net, a free and open lyrics library), sending the title, artist, album and length. Each song is asked about once and the answer is kept on this computer.",
  chinese: "Also ask QQ Music, Kugou and NetEase",
  chineseHint: "Prefers the current player, with word timing and translations. Unofficial online interfaces receive the title, artist and length. Native Kugou and Soda lyric caches are accessed read-only.",
  appleMusic: "Apple Music official lyrics",
  appleMusicHint: "Also requires online lyrics. Requests Apple's word-timed lyrics for songs playing in Apple Music, sending track information and your media token to Apple.",
  appleMusicEnable: "Enable Apple Music lyrics",
  appleMusicToken: "Media user token (media-user-token)",
  appleMusicTokenHint: "The token comes from the Apple Music web player: sign in to music.apple.com in a browser, press F12 for the developer tools, switch to the Network panel and reload the page, set the filter to JS, and open the file named p-*.js whose status is 304. In its cookie, find media-user-token and copy the string between the first = and the first semicolon, then paste it into the box above. The token is kept by the Windows credential manager, never in the island's settings.",
  appleMusicTokenPlaceholder: "media-user-token",
  appleMusicSave: "Save",
  appleMusicClearTitle: "The saved token",
  appleMusicClear: "Clear token",
  appleMusicTokenSaved: "The token is saved in this computer's credential manager.",
  appleMusicTokenMissing: "No token saved yet.",
  appleMusicTokenFailed: "Could not access the local credential manager. Please retry.",
};
