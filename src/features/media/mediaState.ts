import type { MediaState } from "./api";

export const DEFAULT_MEDIA_STATE: MediaState = {
  available: false,
  audioActive: false,
  audioPeak: 0,
  playbackStatus: "unavailable",
  title: null,
  artist: null,
  album: null,
  thumbnail: null,
  positionMs: 0,
  durationMs: 0,
  canSeek: false,
  canNext: false,
  canPrevious: false,
  shuffleActive: null,
  canShuffle: false,
  repeatMode: "unknown",
  canRepeat: false,
  volume: -1,
  sourceApp: null,
  activeSessionId: null,
  sessions: [],
  updatedAt: 0,
};

export function isSameMediaState(a: MediaState, b: MediaState): boolean {
  if (
    a.available !== b.available ||
    a.audioActive !== b.audioActive ||
    a.audioPeak !== b.audioPeak ||
    a.playbackStatus !== b.playbackStatus ||
    a.title !== b.title ||
    a.artist !== b.artist ||
    a.album !== b.album ||
    a.thumbnail !== b.thumbnail ||
    a.trackId !== b.trackId ||
    a.positionMs !== b.positionMs ||
    a.durationMs !== b.durationMs ||
    a.canSeek !== b.canSeek ||
    a.canNext !== b.canNext ||
    a.canPrevious !== b.canPrevious ||
    a.shuffleActive !== b.shuffleActive ||
    a.canShuffle !== b.canShuffle ||
    a.repeatMode !== b.repeatMode ||
    a.canRepeat !== b.canRepeat ||
    a.volume !== b.volume ||
    a.sourceApp !== b.sourceApp ||
    a.activeSessionId !== b.activeSessionId ||
    a.sessions.length !== b.sessions.length
  ) {
    return false;
  }

  return a.sessions.every((session, index) => {
    const other = b.sessions[index];
    return (
      session.id === other.id &&
      session.label === other.label &&
      session.playing === other.playing
    );
  });
}

// Peaks below this are treated as silence.
export const AUDIO_ACTIVE_THRESHOLD = 0.000015;
