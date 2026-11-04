import { Music2, Pause, Play, RefreshCcw, Settings, SkipBack, SkipForward } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { MediaWaveform } from "./MediaWaveform";
import "./MusicPlayerPanel.css";

export function MusicPlayerPanel({
  mediaState,
  isTrackChanging,
  commandError,
  onOpenSettings,
  onPlayPause,
  onNext,
  onPrevious,
}: {
  mediaState: MediaState;
  isTrackChanging: boolean;
  commandError: string | null;
  /** Opens Settings > Music, where the source order is set. */
  onOpenSettings: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const t = useTranslation();
  const isPlaying = mediaState.playbackStatus === "playing";
  const hasTrack = Boolean(mediaState.title);

  const prevDisabled = mediaState.available && !mediaState.canPrevious;
  const nextDisabled = mediaState.available && !mediaState.canNext;

  const settingsButton = (
    <button
      className="music-icon-button"
      type="button"
      title={t.music.openSettings}
      aria-label={t.music.openSettings}
      onClick={onOpenSettings}
    >
      <Settings size={16} strokeWidth={2.2} />
    </button>
  );

  return (
    <section
      className={[
        "music-player",
        !mediaState.available ? "music-player--empty" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t.music.playerLabel}
      title={commandError ?? undefined}
    >
      <div className="music-player__body">
        <div className="music-player__details">
          <div className="music-player__artwork" aria-hidden="true">
            {mediaState.thumbnail ? (
              <img src={mediaState.thumbnail} alt="" draggable={false} />
            ) : (
              <Music2 size={42} strokeWidth={1.7} />
            )}
          </div>
          <div className="music-player__meta">
            <span
              className="music-player__track"
              title={mediaState.title ?? undefined}
            >
              {mediaState.title ?? t.music.noMedia}
            </span>
            {hasTrack && (
              <span
                className="music-player__artist"
                title={mediaState.artist ?? undefined}
              >
                {mediaState.artist ?? t.music.unknownArtist}
              </span>
            )}
          </div>
        </div>
        <div className="music-player__stack">
          <div className="music-player__head-aside">{settingsButton}</div>

          {commandError && (
            <p className="music-player__error" role="alert">
              {t.music.controlFailed}
            </p>
          )}

          <MediaWaveform
            playing={isPlaying || mediaState.audioActive}
            audioPeak={mediaState.audioPeak}
          />

          <div className="music-player__controls">
            <button
              className="music-control-button"
              type="button"
              title={t.music.previous}
              aria-label={t.music.previousTrack}
              disabled={prevDisabled}
              onClick={onPrevious}
            >
              <SkipBack size={18} strokeWidth={2.4} />
            </button>
            <button
              className="music-control-button music-control-button--primary"
              type="button"
              title={isPlaying ? t.music.pause : t.music.play}
              aria-label={isPlaying ? t.music.pause : t.music.play}
              aria-busy={isTrackChanging}
              onClick={onPlayPause}
            >
              {isTrackChanging ? (
                <RefreshCcw
                  className="music-control-button__track-change"
                  size={19}
                  strokeWidth={2.4}
                />
              ) : isPlaying ? (
                <Pause size={20} strokeWidth={2.5} />
              ) : (
                <Play size={20} strokeWidth={2.5} />
              )}
            </button>
            <button
              className="music-control-button"
              type="button"
              title={t.music.next}
              aria-label={t.music.nextTrack}
              disabled={nextDisabled}
              onClick={onNext}
            >
              <SkipForward size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
