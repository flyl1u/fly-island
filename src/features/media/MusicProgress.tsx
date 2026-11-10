import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { playbackPosition } from "./lyrics/lrc";
import { formatTrackTime } from "./trackTime";
import "./MusicProgress.css";

/** How often the bar moves while playing; a second is all the times can show. */
const TICK_MS = 500;

/**
 * A thin bar with the elapsed time under its left end and the time left under its right end. It ticks on its own between Windows' readings,
 * so only this leaf re-renders while a song plays. `durationMs` is the player's length, or the
 * lyrics source's when the player reports none; hidden when neither is known.
 */
export function MusicProgress({ mediaState, durationMs }: { mediaState: MediaState; durationMs: number }) {
  const t = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const playing = mediaState.playbackStatus === "playing";

  useEffect(() => {
    setNow(Date.now());
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, mediaState.updatedAt]);

  if (durationMs <= 0) return null;
  const position = Math.min(durationMs, playbackPosition(mediaState, now));
  const ratio = Math.min(1, Math.max(0, position / durationMs));
  const style = { "--music-progress": `${(ratio * 100).toFixed(2)}%` } as CSSProperties;

  return (
    <div className="music-progress" style={style}>
      <div
        className="music-progress__track"
        role="progressbar"
        aria-label={t.music.progress}
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(position / 1000)}
      >
        <span className="music-progress__fill" />
      </div>
      <span className="music-progress__time">{formatTrackTime(position)}</span>
      <span className="music-progress__time music-progress__time--left">−{formatTrackTime(durationMs - position)}</span>
    </div>
  );
}
