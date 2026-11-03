import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";
import { GripVertical, Music2, Pause, Play, RefreshCcw, Settings, SkipBack, SkipForward, Trash2, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { MediaWaveform } from "./MediaWaveform";
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
  const [draggedSourceId, setDraggedSourceId] = useState<string | null>(null);
  const [dragOverSourceId, setDragOverSourceId] = useState<string | null>(null);

  const isPlaying = mediaState.playbackStatus === "playing";
  const hasTrack = Boolean(mediaState.title);

  const prevDisabled = mediaState.available && !mediaState.canPrevious;
  const nextDisabled = mediaState.available && !mediaState.canNext;

  const liveSessions = mediaState.sessions;

  const getSourceIdAtPoint = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const sourceElement = element?.closest("[data-source-id]");
    return sourceElement instanceof HTMLElement
      ? sourceElement.dataset.sourceId ?? null
      : null;
  }, []);

  const startSourceDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, sourceId: string) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraggedSourceId(sourceId);
      setDragOverSourceId(null);
    },
    [],
  );

  const moveSourceDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!draggedSourceId) {
        return;
      }
      event.preventDefault();
      const targetId = getSourceIdAtPoint(event.clientX, event.clientY);
      setDragOverSourceId(
        targetId && targetId !== draggedSourceId ? targetId : null,
      );
    },
    [draggedSourceId, getSourceIdAtPoint],
  );

  const finishSourceDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!draggedSourceId) {
        return;
      }
      event.preventDefault();
      const targetId =
        dragOverSourceId || getSourceIdAtPoint(event.clientX, event.clientY);

      if (targetId && targetId !== draggedSourceId) {
        onReorderSource(draggedSourceId, targetId);
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setDraggedSourceId(null);
      setDragOverSourceId(null);
    },
    [dragOverSourceId, draggedSourceId, getSourceIdAtPoint, onReorderSource],
  );

  const cancelSourceDrag = useCallback(() => {
    setDraggedSourceId(null);
    setDragOverSourceId(null);
  }, []);

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
          {sourcePriority.length === 0 ? (
            <div className="music-source-empty">{t.music.noSources}</div>
          ) : (
            <div className="music-source-list" role="list">
              {sourcePriority.map((source) => {
                const live = liveSessions.find(
                  (session) => session.id === source.id,
                );
                return (
                  <div
                    key={source.id}
                    className={[
                      "music-source-item",
                      draggedSourceId === source.id
                        ? "music-source-item--dragging"
                        : "",
                      dragOverSourceId === source.id
                        ? "music-source-item--drag-over"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    role="listitem"
                    data-source-id={source.id}
                  >
                    <button
                      className="music-source-drag"
                      type="button"
                      title={t.music.reorderSource}
                      aria-label={t.music.reorderSource}
                      onPointerDown={(event) =>
                        startSourceDrag(event, source.id)
                      }
                      onPointerMove={moveSourceDrag}
                      onPointerUp={finishSourceDrag}
                      onPointerCancel={cancelSourceDrag}
                    >
                      <GripVertical size={15} strokeWidth={2.4} />
                    </button>
                    <span
                      className={[
                        "music-source-dot",
                        live?.playing ? "music-source-dot--playing" : "",
                        live ? "music-source-dot--live" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-hidden="true"
                    />
                    <span className="music-source-label" title={source.id}>
                      {source.label}
                    </span>
                    {!live && (
                      <button
                        className="music-source-remove"
                        type="button"
                        title={t.music.removeSource}
                        aria-label={t.music.removeSource}
                        onClick={() => onRemoveSource(source.id)}
                      >
                        <Trash2 size={14} strokeWidth={2.2} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
