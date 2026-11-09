import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { playbackPosition } from "./lyrics/lrc";
import { formatTrackTime } from "./trackTime";
import "./MusicProgress.css";

/** How often the bar moves while playing; a second is all the times can show. */
const TICK_MS = 500;

/**
 * Elapsed time, a thin bar and the track length. It ticks on its own between Windows' readings,
 * so only this leaf re-renders while a song plays. Hidden when the player reports no length.
 */
export function MusicProgress({ mediaState }: { mediaState: MediaState }) {
  const t = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const playing = mediaState.playbackStatus === "playing";

  useEffect(() => {
    setNow(Date.now());
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, mediaState.updatedAt]);

  if (mediaState.durationMs <= 0) return null;
  const position = playbackPosition(mediaState, now);
  const ratio = Math.min(1, Math.max(0, position / mediaState.durationMs));
  const style = { "--music-progress": `${(ratio * 100).toFixed(2)}%` } as CSSProperties;

  return (
    <div className="music-progress" style={style}>
      <span className="music-progress__time">{formatTrackTime(position)}</span>
      <div
        className="music-progress__track"
        role="progressbar"
        aria-label={t.music.progress}
        aria-valuemin={0}
        aria-valuemax={Math.round(mediaState.durationMs / 1000)}
        aria-valuenow={Math.round(position / 1000)}
      >
        <span className="music-progress__fill" />
      </div>
      <span className="music-progress__time">{formatTrackTime(mediaState.durationMs)}</span>
    </div>
  );
}
