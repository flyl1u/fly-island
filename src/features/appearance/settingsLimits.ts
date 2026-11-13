// The ranges and choices island settings are kept within, and the fallbacks they rest on.
import type { AgentQuotaSource, AgentSessionGroup, AgentSessionSort, CollapsedItem, CollapsedSlot, PageDot } from "./types";

export const AGENT_SESSION_SORTS: readonly AgentSessionSort[] = ["status", "recent", "firstSeen"];
export const AGENT_SESSION_GROUPS: readonly AgentSessionGroup[] = ["computer", "project", "none"];
export const AGENT_QUOTA_SOURCES: readonly AgentQuotaSource[] = ["claudeCode", "codex", "dsh", "workbuddy"];
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
/**
 * Seconds the open island waits after the cursor leaves before it collapses (0 never), and the
 * seconds the collapsed island idles before it tucks into a line at the top edge. Both typed in.
 */
export const AUTO_COLLAPSE_SECONDS = { min: 0, max: 600, default: 30 } as const;
export const TUCK_DELAY_SECONDS = { min: 3, max: 600, default: 30 } as const;
/** Auto-cleanup choices for the file shelf, in days; 0 never cleans up. */
export const SHELF_CLEANUP_DAYS = [0, 1, 7, 30] as const;
export const DEFAULT_TASK_TEXT_COLOR = "#FFFFFF";

export const ISLAND_FONT_PERCENT = { min: 90, max: 120, step: 5, default: 100 } as const;
export const COLLAPSED_WIDTH = { min: 240, max: 480, default: 340 } as const;
export const COLLAPSED_HEIGHT = { min: 32, max: 60, default: 38 } as const;
export const MIN_COLLAPSED_SCALE = 0.75;
export const MAX_COLLAPSED_SCALE = 1.4;

/**
 * The expanded island's size (Appearance → "Expanded size"): a slider over this range in steps
 * of 0.01, stored as the scale in `expandedScale`. Width and height grow together; the native
 * window (src-tauri/src/island/) accepts 0.75–1.4 and makes room for the scaled height, and the
 * 820px-wide window holds the widest island (560 x 1.2 = 672px).
 */
export const MIN_EXPANDED_SCALE = 0.85;
export const MAX_EXPANDED_SCALE = 1.2;

/**
 * A saved scale on the slider: the small / medium / large sizes of 3.0.0 (0.9 / 1 / 1.1) stay as
 * they are, anything older (0.75–1.4) comes within the range, and a non-number falls back to 1.
 */
export function normalizeExpandedScale(value: unknown) {
  const scale = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(scale)) return 1;
  return Math.round(Math.min(MAX_EXPANDED_SCALE, Math.max(MIN_EXPANDED_SCALE, scale)) * 100) / 100;
}

/** The collapsed island's items, in their default order: a running agent, then lyrics, then todos. */
export const COLLAPSED_ITEMS: readonly CollapsedItem[] = ["agent", "lyrics", "todo"];
/** The collapsed island's layout as it always was: the text, then the icons on its right. */
export const COLLAPSED_SLOTS: readonly CollapsedSlot[] = ["text", "mail", "shelf", "music", "agents"];
/** The header's page dots in their default order; translation joined last (2026-11-11). */
export const PAGE_DOTS: readonly PageDot[] = ["todo", "music", "clipboard", "shelf", "translation"];

/** `value` when it is one of `allowed`, else `fallback`: a saved choice from an older or newer build. */
export function oneOf<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}
