import { useRef } from "react";
import { useTranslation } from "../../../i18n";
import { SONG_OFFSET_STEP_MS } from "./songOffsets";

/** A press held this long moves the lyrics in one big step instead of half a second. */
const LONG_PRESS_MS = 600;
/** The step a held press applies, in place of the usual half second. */
const FAST_STEP_MS = 5000;

/**
 * Moves this song's lyrics on or back in half-second steps, next to the music page's
 * settings button; the value between them resets to 0 when clicked.
 * Holding a button down moves the lyrics five seconds at a time, for the songs whose official
 * lyrics sit well away from the music.
 */
export function LyricsOffsetControl({ offsetMs, onChange }: { offsetMs: number; onChange: (ms: number) => void }) {
  const text = useTranslation().music.lyricsOffset;
  const seconds = offsetMs / 1000;
  // Whether this press was held is read when the click arrives, so it lives in a ref.
  const held = useRef(false);
  const timer = useRef<number | null>(null);

  const press = () => {
    held.current = false;
    timer.current = window.setTimeout(() => { held.current = true; }, LONG_PRESS_MS);
  };
  // The click comes after the pointer is released, so the flag is kept until then.
  const release = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const step = (delta: number) => {
    const moved = held.current ? Math.sign(delta) * FAST_STEP_MS : delta;
    held.current = false;
    onChange(offsetMs + moved);
  };
  const stepButton = (delta: number, label: string) => (
    <button
      type="button"
      className="lyrics-offset__step"
      aria-label={label}
      title={text.fast}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={() => { release(); held.current = false; }}
      onPointerCancel={() => { release(); held.current = false; }}
      onClick={() => step(delta)}
    >
      {delta < 0 ? "−" : "+"}
    </button>
  );

  return (
    <span className="lyrics-offset" role="group" aria-label={text.label}>
      {stepButton(SONG_OFFSET_STEP_MS, text.slower)}
      <button
        type="button"
        className="lyrics-offset__value"
        aria-label={text.reset(seconds)}
        title={text.reset(seconds)}
        disabled={offsetMs === 0}
        onClick={() => onChange(0)}
      >
        {offsetMs === 0 ? "0s" : `${seconds > 0 ? "+" : ""}${seconds}s`}
      </button>
      {stepButton(-SONG_OFFSET_STEP_MS, text.faster)}
    </span>
  );
}
