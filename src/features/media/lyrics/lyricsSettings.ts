/** The lyrics settings kept with the island's settings (Settings → Music). */
export type LyricsSettingValues = {
  lyricsFolder: string;
  lyricsOnline: boolean;
  lyricsChinese: boolean;
  lyricsOffsetMs: number;
};

/**
 * No folder, no offset; lyrics are looked up online, Kugou and NetEase included, unless the user
 * turns that off (on by default since 2026-11-10: lyrics are what makes the music page).
 */
export const DEFAULT_LYRICS_SETTINGS: LyricsSettingValues = {
  lyricsFolder: "",
  lyricsOnline: true,
  lyricsChinese: true,
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
  };
}
