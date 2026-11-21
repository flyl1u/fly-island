import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { MusicShortcutAction, MusicShortcuts } from "./shortcuts";

// Corresponds to ShortcutErrors and STATUS_EVENT in media_control/hotkeys.rs.
export type MediaShortcutErrors = Partial<Record<MusicShortcutAction, string>>;
export const MEDIA_SHORTCUT_STATUS_EVENT = "media-shortcut-status";
export function setMediaShortcuts(enabled: boolean, shortcuts: MusicShortcuts, target?: string) {
  return invoke<void>("set_media_shortcuts", { enabled, shortcuts, target });
}
export function getMediaShortcutErrors() {
  return invoke<MediaShortcutErrors>("get_media_shortcut_errors");
}
export function listenMediaShortcutStatus(handler: (errors: MediaShortcutErrors) => void) {
  return listen<MediaShortcutErrors>(MEDIA_SHORTCUT_STATUS_EVENT, (event) => handler(event.payload));
}

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
export type MediaPluginErrorKind = "Unsupported" | "NeedsClose" | "LegacyConflict" | "HashMismatch" | "Network" | "UserDeclined" | "Busy" | "Io"
  | "Blocked" | "DriveUnavailable" | "LoaderExists";
export type MediaPluginError = { kind: MediaPluginErrorKind; detail: string };
export type MediaPluginProgress = { stage: "downloading" | "verifying" | "copying" | "done" | "error"; detail?: string | null };
export type MediaPluginResult = { keptForeignLoader: boolean; preservedFiles: string[] };
// 对应 service.rs 的 ManualInstall：放好的 msimg32.dll，以及要把它拖进去的网易云目录。
export type MediaPluginManualInstall = { staged: string; targetDir: string };
export const MEDIA_PLUGIN_PROGRESS_EVENT = "media-plugin-progress";
export function getNeteasePluginStatus() { return invoke<NeteasePluginStatus>("netease_plugin_status"); }
export function installNeteasePlugin() { return invoke<MediaPluginResult>("install_netease_plugin"); }
export function uninstallNeteasePlugin() { return invoke<MediaPluginResult>("uninstall_netease_plugin"); }
/** 安全软件拦截时的兜底：放好插件、准备好 msimg32.dll 并打开两个文件夹。只在用户点击后调用。 */
export function prepareNeteaseManualInstall() { return invoke<MediaPluginManualInstall>("prepare_netease_manual_install"); }
/** 结束网易云，`relaunch` 时随后重新打开。只在用户点击后调用。对应 media_plugins::close_netease。 */
export function closeNetease(relaunch: boolean) { return invoke<void>("close_netease", { relaunch }); }
export function listenMediaPluginProgress(handler: (progress: MediaPluginProgress) => void) {
  return listen<MediaPluginProgress>(MEDIA_PLUGIN_PROGRESS_EVENT, (event) => handler(event.payload));
}
