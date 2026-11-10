import { useEffect, useState } from "react";
import type { MediaState } from "./api";
import { lineIndexAt, playbackPosition, trackKey } from "./lyrics/lrc";
import { useLyrics, type LyricsSettings } from "./lyrics/useLyrics";
import { useSongOffset } from "./lyrics/useSongOffset";
import "./CollapsedLyric.css";

/** How often the line is checked while playing. */
const TICK_MS = 250;
const OFF = { lyricsFolder: "", lyricsOnline: false };

/**
 * The line being sung, for the collapsed island; the song's title and artist when it has no
 * lyrics or between lines. It ticks on its own, so only this leaf re-renders while a song plays.
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
  const [now, setNow] = useState(() => Date.now());
  const playing = mediaState.playbackStatus === "playing";

  useEffect(() => {
    setNow(Date.now());
    if (!playing || !lines) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, lines, mediaState.updatedAt]);

  const song = [mediaState.title, mediaState.artist].filter(Boolean).join(" · ");
  let line = "";
  if (lines) {
    const index = lineIndexAt(lines, playbackPosition(mediaState, now) - lyricsSettings.lyricsOffsetMs - songOffsetMs);
    line = index >= 0 ? lines[index].text : "";
  }

  return (
    <span className="collapsed-lyric" key={line || song}>
      {line || song}
    </span>
  );
}
