import { useEffect, useState } from "react";
import { useTranslation } from "../../../i18n";
import type { MediaState } from "../api";
import { lineIndexAt, playbackPosition, type LyricLine } from "./lrc";
import "./LyricsView.css";

/** How often the line is checked while playing. */
const TICK_MS = 200;

/**
 * Three lines of synced lyrics above the waveform: the one being sung, bright, between
 * the one before and the one after. A line with a translation shows it under itself in place
 * of the next line. `offsetMs` moves the lyrics later (positive) or earlier.
 */
export function LyricsView({ lines, mediaState, offsetMs }: { lines: LyricLine[]; mediaState: MediaState; offsetMs: number }) {
  const t = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const playing = mediaState.playbackStatus === "playing";

  useEffect(() => {
    setNow(Date.now());
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, mediaState.updatedAt]);

  const index = lineIndexAt(lines, playbackPosition(mediaState, now) - offsetMs);
  const text = (at: number) => (at >= 0 && at < lines.length ? lines[at].text : "");
  // Before the first line (the intro) and in breaks, a note holds the middle row, so the first
  // line waits below it rather than standing alone.
  const current = (index >= 0 && text(index)) || "♪";

  return (
    <div className="lyrics-view" aria-label={t.music.lyricsLabel}>
      <span className="lyrics-view__line lyrics-view__line--side" aria-hidden="true">{text(index - 1)}</span>
      <span className="lyrics-view__line lyrics-view__line--current" key={index} aria-live="off">{current}</span>
      {index >= 0 && lines[index].translation ? (
        <span className="lyrics-view__line lyrics-view__line--translation">{lines[index].translation}</span>
      ) : (
        <span className="lyrics-view__line lyrics-view__line--side" aria-hidden="true">{text(index + 1)}</span>
      )}
    </div>
  );
}
