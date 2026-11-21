import { normalizeClipboardShortcut } from "../clipboard/index.ts";

// Corresponds to MediaShortcuts in src-tauri/src/media_control/hotkeys.rs.
export type MusicShortcuts = { playPause: string; previous: string; next: string };
export type MusicShortcutAction = keyof MusicShortcuts;
export const MUSIC_SHORTCUT_ACTIONS: readonly MusicShortcutAction[] = ["playPause", "previous", "next"];

/** Empty or damaged settings never claim a global key by default. */
export function normalizeMusicShortcuts(value: unknown): MusicShortcuts {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const key = (action: MusicShortcutAction) => typeof record[action] === "string"
    ? normalizeClipboardShortcut(record[action], "") : "";
  return { playPause: key("playPause"), previous: key("previous"), next: key("next") };
}
