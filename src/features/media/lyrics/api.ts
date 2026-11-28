import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Mirrors Lyrics in src-tauri/src/lyrics/mod.rs. */
export type Lyrics = {
  source: "local" | "lrclib" | "kugou" | "netease" | "qqmusic" | "soda" | "applemusic";
  lrc: string;
  /** The translation of the same lines, in LRC, when the source has one. */
  translation?: string | null;
  /** The song's length as the source lists it, when known. */
  durationMs?: number | null;
};

export type LyricsQuery = {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  /** The user's folder of .lrc files; empty when none. */
  folder: string;
  /** Whether LRCLIB may be asked. */
  online: boolean;
  /** Whether Kugou and NetEase may be asked too (unofficial; only with `online`). */
  chinese: boolean;
  /** Whether Apple's own lyrics may be asked (needs the user's media-user-token). */
  appleMusic?: boolean;
  /** The song id a player plugin gives (`NCM-<id>`), which skips the search. */
  trackId: string | null;
  /** SMTC AUMID/process name; selects the native client cache and preferred source. */
  sourceAppId?: string | null;
  wordFill?: boolean;
};

export function getLyrics(query: LyricsQuery) {
  return invoke<Lyrics | null>("get_lyrics", { query });
}

/** The Apple Music media-user-token; the native side keeps it in the Windows credential manager. */
export function setAppleMusicToken(token: string) {
  return invoke<void>("set_apple_music_token", { token });
}

export function clearAppleMusicToken() {
  return invoke<void>("clear_apple_music_token");
}

export function hasAppleMusicToken() {
  return invoke<boolean>("has_apple_music_token");
}

/** Told by the native side when the token is replaced or cleared: the held answers came with the old one. */
const APPLE_MUSIC_TOKEN_CHANGED_EVENT = "apple-music-token-changed";

export function listenAppleMusicTokenChanged(handler: () => void) {
  return listen(APPLE_MUSIC_TOKEN_CHANGED_EVENT, () => handler());
}
