import { Music2, Pause, Play, RefreshCcw, Settings, SkipBack, SkipForward, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { MediaWaveform } from "./MediaWaveform";
import { MusicSourceList } from "./MusicSourceList";
import type { KnownMediaSource } from "./storage";
import "./MusicPlayerPanel.css";

export function MusicPlayerPanel({
  mediaState,
  isTrackChanging,
  commandError,
  sourcePriority,
  settingsOpen,
  onToggleSettings,
  onPlayPause,
  onNext,
  onPrevious,
  onReorderSource,
  onRemoveSource,
}: {
  mediaState: MediaState;
  isTrackChanging: boolean;
  commandError: string | null;
  sourcePriority: KnownMediaSource[];
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onReorderSource: (sourceId: string, targetId: string) => void;
  onRemoveSource: (sourceId: string) => void;
}) {
  const t = useTranslation();
  const isPlaying = mediaState.playbackStatus === "playing";
  const hasTrack = Boolean(mediaState.title);

  const prevDisabled = mediaState.available && !mediaState.canPrevious;
  const nextDisabled = mediaState.available && !mediaState.canNext;

  const liveSessions = mediaState.sessions;

  const settingsButton = (
    <button
      className={[
        "music-icon-button",
        settingsOpen ? "music-icon-button--on" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      type="button"
      title={settingsOpen ? t.music.closeSettings : t.music.openSettings}
      aria-label={settingsOpen ? t.music.closeSettings : t.music.openSettings}
      aria-pressed={settingsOpen}
      onClick={onToggleSettings}
    >
      {settingsOpen ? (
        <X size={16} strokeWidth={2.4} />
      ) : (
        <Settings size={16} strokeWidth={2.2} />
      )}
    </button>
  );

  return (
    <section
      className={[
        "music-player",
        !settingsOpen && !mediaState.available ? "music-player--empty" : "",
        settingsOpen ? "music-player--settings" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t.music.playerLabel}
      title={!settingsOpen && commandError ? commandError : undefined}
    >
      {settingsOpen ? (
        <>
          <div className="music-player__settings-head">
            <span className="music-player__settings-title">
              {t.music.settingsTitle}
            </span>
            {settingsButton}
          </div>
          <p className="music-player__settings-hint">{t.music.settingsHint}</p>
          <MusicSourceList
            sourcePriority={sourcePriority}
            liveSessions={liveSessions}
            onReorderSource={onReorderSource}
            onRemoveSource={onRemoveSource}
          />
        </>
      ) : (
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
      )}
    </section>
  );
}
