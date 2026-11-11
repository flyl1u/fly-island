import { Play } from "lucide-react";
import { useTranslation } from "../../i18n";
import "./MusicIdle.css";

/**
 * The music page with nothing playing: a still record, what is going on and what to do, and one
 * button that sends the play key so the last player can carry on. No empty cover, progress or
 * transport waiting for a song.
 */
export function MusicIdle({ onResume }: { onResume: () => void }) {
  const t = useTranslation();

  return (
    <div className="music-idle">
      <span className="music-idle__record" aria-hidden="true" />
      <div className="music-idle__copy">
        <span className="music-idle__title">{t.music.nothingPlaying}</span>
        <span className="music-idle__hint">{t.music.nothingPlayingHint}</span>
        <button className="music-idle__resume" type="button" title={t.music.resumeHint} onClick={onResume}>
          <Play size={12} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
          {t.music.resume}
        </button>
      </div>
    </div>
  );
}
