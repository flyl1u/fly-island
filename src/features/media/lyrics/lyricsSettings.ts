/** The lyrics settings kept with the island's settings (Settings → Music). */
export type LyricsSettingValues = {
  lyricsFolder: string;
  lyricsOnline: boolean;
  lyricsChinese: boolean;
  lyricWordFill: boolean;
  lyricsAppleMusic: boolean;
  lyricsLxPort: number;
  lyricsOffsetMs: number;
};

/**
 * No folder, no offset; lyrics are looked up online, Kugou and NetEase included, unless the user
 * turns that off (on by default since 2026-11-10: lyrics are what makes the music page).
 * Apple's own lyrics stay off until the user gives a media-user-token.
 */
export const DEFAULT_LYRICS_SETTINGS: LyricsSettingValues = {
  lyricsFolder: "",
  lyricsOnline: true,
  lyricsChinese: true,
  lyricWordFill: false,
  lyricsAppleMusic: false,
  lyricsLxPort: 23330,
  lyricsOffsetMs: 0,
};

/**
 * Saved lyrics settings: whether lyrics are looked up online, and the Chinese sources with them.
 * The folder of .lrc files and the global offset are no longer settings, so they load as the
 * default (no folder, no offset); each song still keeps its own offset (songOffsets.ts).
 */
export function normalizeLyricsSettings(saved: Partial<Record<keyof LyricsSettingValues, unknown>> | null | undefined): LyricsSettingValues {
  return {
    ...DEFAULT_LYRICS_SETTINGS,
    lyricsOnline: saved?.lyricsOnline !== false,
    lyricsChinese: saved?.lyricsChinese !== false,
    lyricWordFill: saved?.lyricWordFill === true,
    lyricsAppleMusic: saved?.lyricsAppleMusic === true,
    lyricsLxPort: typeof saved?.lyricsLxPort === "number" && Number.isFinite(saved.lyricsLxPort)
      && saved.lyricsLxPort >= 1 && saved.lyricsLxPort <= 65535 ? Math.round(saved.lyricsLxPort) : 23330,
  };
}
