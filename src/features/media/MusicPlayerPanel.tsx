import { Music2, Pause, Play, RefreshCcw, Settings, SkipBack, SkipForward } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { MediaWaveform } from "./MediaWaveform";
import { MusicProgress } from "./MusicProgress";
import { LyricsView } from "./lyrics/LyricsView";
import { useLyrics, type LyricsSettings } from "./lyrics/useLyrics";
import { LyricsOffsetControl } from "./lyrics/LyricsOffsetControl";
import { trackKey } from "./lyrics/lrc";
import { suggestsChineseSources } from "./lyrics/chineseHint";
import { useSongOffset } from "./lyrics/useSongOffset";
import "./MusicPlayerPanel.css";

const NO_LYRICS = { lyricsFolder: "", lyricsOnline: false, lyricsOffsetMs: 0 };

/**
 * The music page: artwork on the left; on the right the song, its lyrics (or the waveform when
 * there are none), the progress and the controls. The artwork, blurred, tints the whole card.
 */
export function MusicPlayerPanel({
  mediaState,
  isTrackChanging,
  commandError,
  onOpenSettings,
  onPlayPause,
  onNext,
  onPrevious,
  lyricsSettings = NO_LYRICS,
}: {
  mediaState: MediaState;
  isTrackChanging: boolean;
  commandError: string | null;
  /** Opens Settings > Music, where lyrics sources are switched on. */
  onOpenSettings: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  /** Where lyrics come from and how far they are moved; without it there are none. */
  lyricsSettings?: LyricsSettings & { lyricsOffsetMs: number };
}) {
  const t = useTranslation();
  const isPlaying = mediaState.playbackStatus === "playing";
  const hasTrack = Boolean(mediaState.title);
  const { lines: lyrics, notFound } = useLyrics(mediaState, lyricsSettings);
  const chineseHint = suggestsChineseSources(mediaState, lyricsSettings, notFound);
  const [songOffsetMs, setSongOffsetMs] = useSongOffset(lyrics ? trackKey(mediaState) : null);
  const source = mediaState.sessions.find((session) => session.id === mediaState.activeSessionId)?.label;
  const subtitle = [hasTrack ? mediaState.artist ?? t.music.unknownArtist : null, source].filter(Boolean).join(" · ");

  const prevDisabled = mediaState.available && !mediaState.canPrevious;
  const nextDisabled = mediaState.available && !mediaState.canNext;

  return (
    <section
      className={["music-player", !mediaState.available ? "music-player--empty" : "", isPlaying ? "music-player--playing" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={t.music.playerLabel}
    >
      {mediaState.thumbnail && (
        <div className="music-player__backdrop" aria-hidden="true">
          <img src={mediaState.thumbnail} alt="" draggable={false} />
        </div>
      )}
      <div className="music-player__artwork" aria-hidden="true">
        {mediaState.thumbnail ? (
          <img src={mediaState.thumbnail} alt="" draggable={false} />
        ) : (
          <Music2 size={36} strokeWidth={1.6} />
        )}
      </div>

      <div className="music-player__main">
        <header className="music-player__head">
          <div className="music-player__meta">
            <span className="music-player__track">{mediaState.title ?? t.music.noMedia}</span>
            {subtitle && <span className="music-player__artist">{subtitle}</span>}
          </div>
          <div className="music-player__head-aside">
            {lyrics && <LyricsOffsetControl offsetMs={songOffsetMs} onChange={setSongOffsetMs} />}
            {chineseHint && (
              <button className="music-player__lyrics-hint" type="button" aria-label={t.music.lyricsChineseHint.label} onClick={onOpenSettings}>
                {t.music.lyricsChineseHint.text}
              </button>
            )}
            <button className="music-icon-button" type="button" aria-label={t.music.openSettings} title={t.music.openSettings} onClick={onOpenSettings}>
              <Settings size={14} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        <div className={lyrics ? "music-player__stage music-player__stage--lyrics" : "music-player__stage"}>
          {lyrics && <LyricsView lines={lyrics} mediaState={mediaState} offsetMs={lyricsSettings.lyricsOffsetMs + songOffsetMs} />}
          {/* Behind the lyrics the waveform stays as a faint strip; without them it fills the stage. */}
          <MediaWaveform playing={isPlaying || mediaState.audioActive} audioPeak={mediaState.audioPeak} />
        </div>

        {commandError && (
          <p className="music-player__error" role="alert">
            {t.music.controlFailed}
          </p>
        )}

        <MusicProgress mediaState={mediaState} />

        <div className="music-player__controls">
          <button className="music-control-button" type="button" aria-label={t.music.previousTrack} disabled={prevDisabled} onClick={onPrevious}>
            <SkipBack size={17} strokeWidth={2.3} fill="currentColor" />
          </button>
          <button
            className="music-control-button music-control-button--primary"
            type="button"
            aria-label={isPlaying ? t.music.pause : t.music.play}
            aria-busy={isTrackChanging}
            onClick={onPlayPause}
          >
            {isTrackChanging ? (
              <RefreshCcw className="music-control-button__track-change" size={18} strokeWidth={2.4} />
            ) : isPlaying ? (
              <Pause size={19} strokeWidth={2.4} fill="currentColor" />
            ) : (
              <Play size={19} strokeWidth={2.4} fill="currentColor" className="music-control-button__play-icon" />
            )}
          </button>
          <button className="music-control-button" type="button" aria-label={t.music.nextTrack} disabled={nextDisabled} onClick={onNext}>
            <SkipForward size={17} strokeWidth={2.3} fill="currentColor" />
          </button>
        </div>
      </div>
    </section>
  );
}
