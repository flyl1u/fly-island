/** Han characters, as the native side tells a Chinese-named song (src-tauri/src/lyrics/mod.rs). */
const HAN = /[一-鿿]/;

/**
 * Whether the music page should suggest Kugou and NetEase: lyrics were looked up online and
 * nothing was found for a song named in Chinese, while only LRCLIB, which has few Chinese
 * songs, was asked. A folder-only setup asked nothing online on purpose, so it gets no hint.
 */
export function suggestsChineseSources(
  track: { title: string | null; artist: string | null },
  settings: { lyricsOnline: boolean; lyricsChinese?: boolean },
  notFound: boolean,
) {
  return notFound && settings.lyricsOnline && settings.lyricsChinese !== true && HAN.test(`${track.title ?? ""}${track.artist ?? ""}`);
}
