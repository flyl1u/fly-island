import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// 与 src-tauri/src/media_control/service.rs 中的 MediaState、MediaSessionInfo、AudioLevel 对应。
export type MediaPlaybackStatus = "unavailable" | "playing" | "paused";

export type MediaRepeatMode = "none" | "track" | "list" | "unknown";

export type MediaSessionInfo = {
  id: string;
  label: string;
  playing: boolean;
};

export type MediaState = {
  available: boolean;
  audioActive: boolean;
  audioPeak: number;
  playbackStatus: MediaPlaybackStatus;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumbnail: string | null;
  /** A song id a player plugin gives (`NCM-<id>`, `QQ-<id>`); missing from older builds. */
  trackId?: string | null;
  positionMs: number;
  durationMs: number;
  canSeek: boolean;
  canNext: boolean;
  canPrevious: boolean;
  shuffleActive: boolean | null;
  canShuffle: boolean;
  repeatMode: MediaRepeatMode;
  canRepeat: boolean;
  volume: number;
  sourceApp: string | null;
  activeSessionId: string | null;
  sessions: MediaSessionInfo[];
  updatedAt: number;
};

export type AudioLevel = {
  active: boolean;
  peak: number;
  updatedAt: number;
};

export type MediaCommand = "media_play_pause" | "media_next" | "media_previous";

export function getMediaState(target: string | undefined) {
  return invoke<MediaState>("get_media_state", { target });
}

export function sendMediaCommand(command: MediaCommand, target: string | undefined) {
  return invoke<MediaState>(command, { target });
}

export function getAudioLevel() {
  return invoke<AudioLevel>("get_audio_level");
}

/** Moves playback to `positionMs` from the track's start; fails when the player does not allow it (`canSeek`). */
export function seekMedia(positionMs: number, target: string | undefined) {
  return invoke<MediaState>("media_seek", { positionMs: Math.max(0, Math.round(positionMs)), target });
}

// 与 media_control/watcher.rs 中的 MEDIA_CHANGED_EVENT 一致；无载荷，收到后重新读取状态。
export const MEDIA_SESSION_CHANGED_EVENT = "media-session-changed";

export function listenMediaSessionChanged(handler: () => void) {
  return listen(MEDIA_SESSION_CHANGED_EVENT, handler);
}
