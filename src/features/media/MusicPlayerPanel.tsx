import type { CSSProperties } from "react";
import { MicVocal, Music2, Pause, Play, RefreshCcw, SkipBack, SkipForward } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { MusicEqualizer } from "./MusicEqualizer";
import { MusicIdle } from "./MusicIdle";
import { MusicProgress } from "./MusicProgress";
import { useArtworkTint } from "./useArtworkTint";
import { LyricsView } from "./lyrics/LyricsView";
import { useLyrics, type LyricsSettings } from "./lyrics/useLyrics";
import { LyricsOffsetControl } from "./lyrics/LyricsOffsetControl";
import { trackKey } from "./lyrics/lrc";
import { suggestsChineseSources } from "./lyrics/chineseHint";
import { useSongOffset } from "./lyrics/useSongOffset";
import "./MusicPlayerPanel.css";
import { hasTimeline } from "./trackClock";
import { useMediaDiagnostics } from "./useMediaDiagnostics";
import { MediaNotice, MediaNoticeButton, useMediaNotice } from "./MediaNotice";

const NO_LYRICS = { lyricsFolder: "", lyricsOnline: false, lyricsOffsetMs: 0 };

type MusicPlayerPanelProps = {
  mediaState: MediaState;
  isTrackChanging: boolean;
  commandError: string | null;
  /** Opens Settings > Music, where lyrics sources are switched on. */
  onOpenSettings: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  /** Moves playback, from the progress bar; without it the bar is read-only. */
  onSeek?: (positionMs: number) => void;
  onCalibrate?: (positionMs: number) => void;
  /** Where lyrics come from and how far they are moved; without it there are none. */
  lyricsSettings?: LyricsSettings & { lyricsOffsetMs: number };
};

/**
 * The music page, drawn straight on the island like the Agent page rather than in a card of its
 * own. The song's cover, title and artist sit at the top; under them the lyrics, when there are
 * any, then a progress bar with elapsed and remaining time and the transport. Without lyrics the
 * cover grows and takes their room. The cover's colours glow softly beneath it, and its accent
 * tints the progress fill and the equalizer. Nothing playing shows its own quiet page (MusicIdle),
 * not an empty player.
 */
export function MusicPlayerPanel({
  mediaState,
  isTrackChanging,
  commandError,
  onOpenSettings,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
  onCalibrate,
  lyricsSettings = NO_LYRICS,
}: MusicPlayerPanelProps) {
  const t = useTranslation();
  const { diagnostics } = useMediaDiagnostics(mediaState.activeSessionId ?? mediaState.sourceApp);
  const currentId = mediaState.activeSessionId ?? mediaState.sourceApp;
  const diagnostic = diagnostics.players.find((player) => player.sourceAppId === currentId)
    ?? (!currentId && !mediaState.title ? diagnostics.players.find((player) => !player.hasSession) : undefined);
  const notice = useMediaNotice(diagnostic);
  const onLyricPosition = !hasTimeline(mediaState) ? onCalibrate : mediaState.canSeek ? onSeek : undefined;
  const isPlaying = mediaState.playbackStatus === "playing";
  const hasTrack = Boolean(mediaState.title);
  const { lines: lyrics, notFound, durationMs: lyricsDurationMs } = useLyrics(mediaState, lyricsSettings);
  const chineseHint = suggestsChineseSources(mediaState, lyricsSettings, notFound);
  const [songOffsetMs, setSongOffsetMs] = useSongOffset(lyrics ? trackKey(mediaState) : null);
  const tint = useArtworkTint(mediaState.thumbnail);
  const source = mediaState.sessions.find((session) => session.id === mediaState.activeSessionId)?.label ?? mediaState.sourceApp;
  const artist = mediaState.artist || t.music.unknownArtist;

  const prevDisabled = mediaState.available && !mediaState.canPrevious;
  const nextDisabled = mediaState.available && !mediaState.canNext;
  const className = [
    "music-player",
    lyrics ? "music-player--lyrics" : "",
    isPlaying ? "music-player--playing" : "",
    hasTrack ? "" : "music-player--idle",
  ].filter(Boolean).join(" ");
  const style = (tint ? { "--music-tint": tint } : undefined) as CSSProperties | undefined;

  return (
    <section className={className} style={style} aria-label={t.music.playerLabel}>
      {hasTrack ? (
        <header className="music-player__head">
          <div className="music-player__cover" aria-hidden="true">
            {mediaState.thumbnail && <img className="music-player__glow" src={mediaState.thumbnail} alt="" draggable={false} />}
            <div className="music-player__artwork">
              {mediaState.thumbnail ? <img src={mediaState.thumbnail} alt="" draggable={false} /> : <Music2 size={24} strokeWidth={1.5} absoluteStrokeWidth />}
            </div>
          </div>
          <div className="music-player__meta">
            <span className="music-player__track">{mediaState.title}</span>
            <span className="music-player__artist">{artist}</span>
            {!lyrics && (chineseHint ? (
              <button className="music-player__lyrics-hint" type="button" aria-label={t.music.lyricsChineseHint.label} onClick={onOpenSettings}>
                {t.music.lyricsChineseHint.text}
              </button>
            ) : (
              <span className="music-player__source">{[mediaState.album, source].filter(Boolean).join(" · ")}</span>
            ))}
          </div>
          <div className="music-player__aside">
            {notice.player && <MediaNoticeButton open={notice.open} onClick={notice.toggle} />}
            <MusicEqualizer playing={isPlaying} />
            {/* A microphone, not a gear: the island's header already has the gear for Settings. */}
            <button className="music-icon-button" type="button" aria-label={t.music.openSettings} onClick={onOpenSettings}>
              <MicVocal size={16} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          </div>
        </header>
      ) : (
        <MusicIdle onResume={onPlayPause} />
      )}

      {notice.open && notice.player && <MediaNotice player={notice.player} onClose={notice.close} />}

      {lyrics && (
        <div className="music-player__lyrics">
          <LyricsView lines={lyrics} mediaState={mediaState} offsetMs={lyricsSettings.lyricsOffsetMs + songOffsetMs} onPosition={onLyricPosition} />
          <LyricsOffsetControl offsetMs={songOffsetMs} onChange={setSongOffsetMs} />
        </div>
      )}

      {commandError && <p className="music-player__error" role="alert">{t.music.controlFailed}</p>}

      {/* A player that reports no length (NetEase Cloud Music) borrows the lyrics source's. */}
      {hasTrack && <MusicProgress mediaState={mediaState} durationMs={mediaState.durationMs > 0 ? mediaState.durationMs : lyricsDurationMs} onSeek={onSeek} />}

      {hasTrack && (
        <div className="music-player__controls">
          <button className="music-control-button" type="button" aria-label={t.music.previousTrack} disabled={prevDisabled} onClick={onPrevious}>
            <SkipBack size={22} strokeWidth={1.5} fill="currentColor" />
          </button>
          <button
            className="music-control-button music-control-button--primary"
            type="button"
            aria-label={isPlaying ? t.music.pause : t.music.play}
            aria-busy={isTrackChanging}
            onClick={onPlayPause}
          >
            {isTrackChanging ? (
              <RefreshCcw className="music-control-button__track-change" size={22} strokeWidth={2} />
            ) : isPlaying ? (
              <Pause size={26} strokeWidth={1.5} fill="currentColor" />
            ) : (
              <Play size={26} strokeWidth={1.5} fill="currentColor" className="music-control-button__play-icon" />
            )}
          </button>
          <button className="music-control-button" type="button" aria-label={t.music.nextTrack} disabled={nextDisabled} onClick={onNext}>
            <SkipForward size={22} strokeWidth={1.5} fill="currentColor" />
          </button>
        </div>
      )}
    </section>
  );
}
