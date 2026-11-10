// The ranges and choices island settings are kept within, and the fallbacks they rest on.
import type { AgentSessionGroup, AgentSessionSort, CollapsedItem, PageDot } from "./types";

export const AGENT_SESSION_SORTS: readonly AgentSessionSort[] = ["status", "recent", "firstSeen"];
export const AGENT_SESSION_GROUPS: readonly AgentSessionGroup[] = ["computer", "project", "none"];
/** Choices for how far back the Agent page lists sessions, in hours. */
export const AGENT_SESSION_HOURS = [1, 2, 6, 24] as const;
/** How long a page opened for an agent alert stays, in seconds. */
export const AGENT_ALERT_SECONDS = [3, 5, 8, 15, 30] as const;

// Bottom corner radius of the expanded island; every other island radius scales from it
// (IslandShell.css). 1.4x a 30px corner, for Apple's continuous corner (cornerShape.ts); the
// collapsed bar's corners come out at 31px of its 38px height.
export const DEFAULT_ISLAND_CORNER_RADIUS = 42;
export const DEFAULT_HOVER_EXPAND_DELAY_MS = 0;
export const DEFAULT_HOVER_COLLAPSE_DELAY_MS = 0;
export const DEFAULT_AUTO_TUCK_RETRACT_DELAY_MS = 500;
// Tallest panel before the todo list and other long pages scroll. The default is the
// height the todo page reached before this was a setting (six rows).
export const DEFAULT_MAX_PANEL_HEIGHT = 490;
// Rows the clipboard page shows before it scrolls: a short page, the rest a scroll away.
export const DEFAULT_CLIPBOARD_VISIBLE_ROWS = 4;
export const DEFAULT_AGENT_VISIBLE_ROWS = 2;
export const MIN_AGENT_VISIBLE_ROWS = 2;
// Five sessions is the tallest Agent page the native window accepts (627px of 656px).
export const MAX_AGENT_VISIBLE_ROWS = 5;
// File shelf cap; matches MAX_ITEMS in src-tauri/src/file_shelf/store.rs.
export const DEFAULT_SHELF_ITEMS = 100;
/** Auto-cleanup choices for the file shelf, in days; 0 never cleans up. */
export const SHELF_CLEANUP_DAYS = [0, 1, 7, 30] as const;
export const DEFAULT_TASK_TEXT_COLOR = "#ffffff";

/** The collapsed island's items, in their default order: a running agent, then lyrics, then todos. */
export const COLLAPSED_ITEMS: readonly CollapsedItem[] = ["agent", "lyrics", "todo"];
/** The header's page dots in their default order. */
export const PAGE_DOTS: readonly PageDot[] = ["todo", "music", "clipboard", "shelf"];

/** `value` when it is one of `allowed`, else `fallback`: a saved choice from an older or newer build. */
export function oneOf<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}
