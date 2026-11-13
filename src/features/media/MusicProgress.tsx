import { useEffect, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { playbackPosition } from "./lyrics/lrc";
import { isPositionJump, positionAtPointer } from "./positionAnchor";
import { formatTrackTime } from "./trackTime";
import { hasTimeline } from "./trackClock";
import "./MusicProgress.css";

/** How often the bar moves while playing; a second is all the times can show. */
const TICK_MS = 500;
/** How far an arrow key moves playback. */
const KEY_STEP_MS = 5000;

type Props = {
  mediaState: MediaState;
  durationMs: number;
  /** Moves playback; without it, or when the player allows no seeking, the bar is read-only. */
  onSeek?: (positionMs: number) => void;
};

/**
 * A thin bar with the elapsed time under its left end and the time left under its right end. It ticks on its own between Windows' readings,
 * so only this leaf re-renders while a song plays. `durationMs` is the player's length, or the
 * lyrics source's when the player reports none; hidden when neither is known.
 * When the player takes seeks (and reports its own length), the bar can be clicked or dragged:
 * the times follow the pointer, and the seek is sent on release.
 */
export function MusicProgress({ mediaState, durationMs, onSeek }: Props) {
  const t = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const [dragMs, setDragMs] = useState<number | null>(null);
  const [anchor, setAnchor] = useState({ state: mediaState, jumped: false });
  const playing = mediaState.playbackStatus === "playing";
  const estimated = !hasTimeline(mediaState);
  const seekable = !estimated && Boolean(onSeek) && mediaState.canSeek && mediaState.durationMs > 0;

  // A seek (here or in the player) moves the fill at once instead of sliding it across.
  if (anchor.state.positionMs !== mediaState.positionMs || anchor.state.updatedAt !== mediaState.updatedAt) {
    setAnchor({ state: mediaState, jumped: isPositionJump(anchor.state, mediaState) });
  }

  // Once moved, the fill slides with playback again.
  useEffect(() => {
    if (!anchor.jumped) return;
    const timer = window.setTimeout(() => setAnchor((current) => ({ ...current, jumped: false })), TICK_MS);
    return () => window.clearTimeout(timer);
  }, [anchor.jumped]);

  useEffect(() => {
    setNow(Date.now());
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, mediaState.updatedAt]);

  if (durationMs <= 0) return null;
  const position = dragMs ?? Math.min(durationMs, playbackPosition(mediaState, now));
  const ratio = Math.min(1, Math.max(0, position / durationMs));
  const style = { "--music-progress": `${(ratio * 100).toFixed(2)}%` } as CSSProperties;
  const className = [
    "music-progress",
    estimated ? "music-progress--estimated" : "",
    seekable ? "music-progress--seekable" : "",
    dragMs !== null ? "music-progress--dragging" : "",
    anchor.jumped || dragMs !== null ? "music-progress--snap" : "",
  ].filter(Boolean).join(" ");

  const pointerPosition = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return positionAtPointer(event.clientX, box.left, box.width, durationMs);
  };
  const seek = (positionMs: number) => onSeek?.(Math.min(durationMs, Math.max(0, positionMs)));
  const keySeek = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = { ArrowLeft: position - KEY_STEP_MS, ArrowDown: position - KEY_STEP_MS, ArrowRight: position + KEY_STEP_MS,
      ArrowUp: position + KEY_STEP_MS, Home: 0, End: durationMs }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    seek(target);
  };

  const seekHandlers = seekable ? {
    role: "slider",
    tabIndex: 0,
    "aria-valuetext": `${formatTrackTime(position)} / ${formatTrackTime(durationMs)}`,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      // Keeps the drag when the pointer leaves the bar; a pointer already gone cannot be captured.
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* the drag still works over the bar */ }
      setDragMs(pointerPosition(event));
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (dragMs !== null) setDragMs(pointerPosition(event));
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (dragMs === null) return;
      setDragMs(null);
      seek(pointerPosition(event));
    },
    onPointerCancel: () => setDragMs(null),
    onKeyDown: keySeek,
  } : { role: "progressbar" };

  return (
    <div className={className} style={style} title={estimated ? t.music.estimatedProgress : undefined}>
      <div
        className="music-progress__hit"
        aria-label={t.music.progress}
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(position / 1000)}
        {...seekHandlers}
      >
        <div className="music-progress__track">
          <span className="music-progress__fill" />
        </div>
        {seekable && <span className="music-progress__knob" aria-hidden="true" />}
      </div>
      <span className="music-progress__time">{formatTrackTime(position)}</span>
      <span className="music-progress__time music-progress__time--left">−{formatTrackTime(durationMs - position)}</span>
    </div>
  );
}
