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
  hasTimeline?: boolean;
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

// 对应 src-tauri/src/media_control/diagnostics.rs 的 MediaDiagnostics、PlayerDiagnostic。
export type MediaDiagnosticStatus = "ok" | "noTimeline" | "needsUpdate" | "smtcOff" | "neteaseNeedsPlugin" | "neteasePluginInactive";
export type PlayerDiagnostic = {
  sourceAppId: string;
  label: string;
  hasSession: boolean;
  hasTimeline: boolean;
  hasPluginTrackId: boolean;
  exePath: string | null;
  directory: string | null;
  version: string | null;
  status: MediaDiagnosticStatus;
  neteasePluginState: "none" | "loaderOnly" | "installed" | "foreignLoader" | "unknown" | null;
};
export type MediaDiagnostics = { players: PlayerDiagnostic[] };
export function getMediaDiagnostics() {
  return invoke<MediaDiagnostics>("get_media_diagnostics");
}

// 对应 src-tauri/src/media_plugins/netease.rs 的 NeteasePluginStatus。
export type NeteasePluginStatus = {
  state: "none" | "loaderOnly" | "installed" | "foreignLoader" | "unknown";
  supported: boolean; tested: boolean; version: string | null; arch: "x64" | "x86" | null;
  installDir: string | null; running: boolean; legacyInfLink: boolean; pluginDir: string;
};
// 对应 src-tauri/src/media_plugins/mod.rs 的 PluginError、Progress，以及 service.rs 的 OperationResult。
export type MediaPluginErrorKind = "Unsupported" | "NeedsClose" | "LegacyConflict" | "HashMismatch" | "Network" | "UserDeclined" | "Busy" | "Io";
export type MediaPluginError = { kind: MediaPluginErrorKind; detail: string };
export type MediaPluginProgress = { stage: "downloading" | "verifying" | "copying" | "done" | "error"; detail?: string | null };
export type MediaPluginResult = { keptForeignLoader: boolean; preservedFiles: string[] };
export const MEDIA_PLUGIN_PROGRESS_EVENT = "media-plugin-progress";
export function getNeteasePluginStatus() { return invoke<NeteasePluginStatus>("netease_plugin_status"); }
export function installNeteasePlugin() { return invoke<MediaPluginResult>("install_netease_plugin"); }
export function uninstallNeteasePlugin() { return invoke<MediaPluginResult>("uninstall_netease_plugin"); }
/** 结束网易云，`relaunch` 时随后重新打开。只在用户点击后调用。对应 media_plugins::close_netease。 */
export function closeNetease(relaunch: boolean) { return invoke<void>("close_netease", { relaunch }); }
export function listenMediaPluginProgress(handler: (progress: MediaPluginProgress) => void) {
  return listen<MediaPluginProgress>(MEDIA_PLUGIN_PROGRESS_EVENT, (event) => handler(event.payload));
}
