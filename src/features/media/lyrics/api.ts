import { invoke } from "@tauri-apps/api/core";

/** Mirrors Lyrics in src-tauri/src/lyrics/mod.rs. */
export type Lyrics = {
  source: "local" | "lrclib" | "kugou" | "netease";
  lrc: string;
  /** The translation of the same lines, in LRC, when the source has one. */
  translation?: string | null;
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
  /** The song id a player plugin gives (`NCM-<id>`), which skips the search. */
  trackId: string | null;
};

export function getLyrics(query: LyricsQuery) {
  return invoke<Lyrics | null>("get_lyrics", { query });
}
