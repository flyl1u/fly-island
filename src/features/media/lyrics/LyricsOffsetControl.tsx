import { useTranslation } from "../../../i18n";
import { SONG_OFFSET_STEP_MS } from "./songOffsets";

/**
 * Moves this song's lyrics earlier or later in half-second steps, next to the music page's
 * settings button; the value between them resets to 0 when clicked.
 */
export function LyricsOffsetControl({ offsetMs, onChange }: { offsetMs: number; onChange: (ms: number) => void }) {
  const text = useTranslation().music.lyricsOffset;
  const seconds = offsetMs / 1000;
  return (
    <span className="lyrics-offset" role="group" aria-label={text.label}>
      <button type="button" className="lyrics-offset__step" aria-label={text.earlier} onClick={() => onChange(offsetMs - SONG_OFFSET_STEP_MS)}>
        −
      </button>
      <button
        type="button"
        className="lyrics-offset__value"
        aria-label={text.reset(seconds)}
        disabled={offsetMs === 0}
        onClick={() => onChange(0)}
      >
        {offsetMs === 0 ? "0s" : `${seconds > 0 ? "+" : ""}${seconds}s`}
      </button>
      <button type="button" className="lyrics-offset__step" aria-label={text.later} onClick={() => onChange(offsetMs + SONG_OFFSET_STEP_MS)}>
        +
      </button>
    </span>
  );
}
