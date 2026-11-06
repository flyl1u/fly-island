import { invoke } from "@tauri-apps/api/core";

/** Mirrors Lyrics in src-tauri/src/lyrics/mod.rs. */
export type Lyrics = { source: "local" | "lrclib"; lrc: string };

export type LyricsQuery = {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  /** The user's folder of .lrc files; empty when none. */
  folder: string;
  /** Whether LRCLIB may be asked. */
  online: boolean;
};

export function getLyrics(query: LyricsQuery) {
  return invoke<Lyrics | null>("get_lyrics", { query });
}
