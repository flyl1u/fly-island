import { Music2, Pause, Play, RefreshCcw, Settings, SkipBack, SkipForward } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { MediaWaveform } from "./MediaWaveform";
import { LyricsView } from "./lyrics/LyricsView";
import { useLyrics, type LyricsSettings } from "./lyrics/useLyrics";
import { LyricsOffsetControl } from "./lyrics/LyricsOffsetControl";
import { trackKey } from "./lyrics/lrc";
import { suggestsChineseSources } from "./lyrics/chineseHint";
import { useSongOffset } from "./lyrics/useSongOffset";
import "./MusicPlayerPanel.css";

const NO_LYRICS = { lyricsFolder: "", lyricsOnline: false, lyricsOffsetMs: 0 };

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
  /** Opens Settings > Music, where the source order is set. */
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

  const prevDisabled = mediaState.available && !mediaState.canPrevious;
  const nextDisabled = mediaState.available && !mediaState.canNext;

  const settingsButton = (
    <button
      className="music-icon-button"
      type="button"
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
            >
              {mediaState.title ?? t.music.noMedia}
            </span>
            {hasTrack && (
              <span
                className="music-player__artist"
              >
                {mediaState.artist ?? t.music.unknownArtist}
              </span>
            )}
          </div>
        </div>
        <div className={lyrics ? "music-player__stack music-player__stack--lyrics" : "music-player__stack"}>
          <div className="music-player__head-aside">
            {lyrics && <LyricsOffsetControl offsetMs={songOffsetMs} onChange={setSongOffsetMs} />}
            {chineseHint && (
              <button className="music-player__lyrics-hint" type="button" aria-label={t.music.lyricsChineseHint.label} onClick={onOpenSettings}>
                {t.music.lyricsChineseHint.text}
              </button>
            )}
            {settingsButton}
          </div>

          {commandError && (
            <p className="music-player__error" role="alert">
              {t.music.controlFailed}
            </p>
          )}

          {/* With lyrics, the waveform shrinks to a strip under them rather than going away. */}
          {lyrics && <LyricsView lines={lyrics} mediaState={mediaState} offsetMs={lyricsSettings.lyricsOffsetMs + songOffsetMs} />}
          <MediaWaveform
            playing={isPlaying || mediaState.audioActive}
            audioPeak={mediaState.audioPeak}
          />

          <div className="music-player__controls">
            <button
              className="music-control-button"
              type="button"
              aria-label={t.music.previousTrack}
              disabled={prevDisabled}
              onClick={onPrevious}
            >
              <SkipBack size={18} strokeWidth={2.4} />
            </button>
            <button
              className="music-control-button music-control-button--primary"
              type="button"
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
