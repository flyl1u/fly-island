import type { MediaState } from "./api";
import { trackKey } from "./lyrics/lrc";
import { useLyricClock } from "./lyrics/useLyricClock";
import { useLyrics, type LyricsSettings } from "./lyrics/useLyrics";
import { useSongOffset } from "./lyrics/useSongOffset";
import "./CollapsedLyric.css";

const OFF = { lyricsFolder: "", lyricsOnline: false };

/**
 * The line being sung, for the collapsed island; the song's title and artist when it has no
 * lyrics or between lines. It wakes on its own for each line, so only this leaf re-renders while a
 * song plays; a new line replaces the last at once (the music page lets it rise in).
 * `active` is false while the island is expanded: the music page then looks the lyrics up, and
 * this one asks again (from the native disk cache) when the island collapses.
 */
export function CollapsedLyric({
  mediaState,
  lyricsSettings,
  active,
}: {
  mediaState: MediaState;
  lyricsSettings: LyricsSettings & { lyricsOffsetMs: number };
  active: boolean;
}) {
  const { lines } = useLyrics(mediaState, active ? lyricsSettings : OFF);
  const [songOffsetMs] = useSongOffset(lines ? trackKey(mediaState) : null);
  const { index } = useLyricClock(lines, mediaState, lyricsSettings.lyricsOffsetMs + songOffsetMs);
  const song = [mediaState.title, mediaState.artist].filter(Boolean).join(" · ");
  const line = lines && index >= 0 ? lines[index].text : "";

  return (
    <span className="collapsed-lyric">{line || song}</span>
  );
}
