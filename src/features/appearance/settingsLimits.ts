// The ranges and choices island settings are kept within, and the fallbacks they rest on.
import type { AgentHostDisplay, AgentSessionView } from "./types";

export const AGENT_HOST_DISPLAYS: readonly AgentHostDisplay[] = ["both", "icon", "name", "off"];
export const AGENT_SESSION_VIEWS: readonly AgentSessionView[] = ["list", "cards", "compact"];
/** Choices for how far back the Agent page lists sessions, in hours. */
export const AGENT_SESSION_HOURS = [1, 2, 6, 24] as const;
/** How long a page opened for an agent alert stays, in seconds. */
export const AGENT_ALERT_SECONDS = [3, 5, 8, 15, 30] as const;
/** Reminding again about a session still waiting on the user: after this many seconds; 0 is off. */
export const AGENT_REMIND_SECONDS = [0, 30, 60, 120, 300] as const;
/** Usage level (percent) that pops up an alert; 0 is off. */
export const AGENT_QUOTA_ALERT_PERCENTS = [0, 70, 80, 90] as const;

export const MAX_CUSTOM_SETTING_PRESETS = 6;
export const MIN_TOP_FILLET_RADIUS = 0;
// The island window leaves room beside the island for fillets up to this size.
export const MAX_TOP_FILLET_RADIUS = 12;
// Bottom corner radius of the expanded island; every other island radius scales from it.
export const DEFAULT_ISLAND_CORNER_RADIUS = 16;
export const MIN_ISLAND_CORNER_RADIUS = 16;
export const MAX_ISLAND_CORNER_RADIUS = 40;
export const DEFAULT_HOVER_EXPAND_DELAY_MS = 0;
export const MIN_HOVER_EXPAND_DELAY_MS = 0;
export const MAX_HOVER_EXPAND_DELAY_MS = 1_000;
export const DEFAULT_HOVER_COLLAPSE_DELAY_MS = 0;
export const MIN_HOVER_COLLAPSE_DELAY_MS = 0;
export const MAX_HOVER_COLLAPSE_DELAY_MS = 2_000;
export const DEFAULT_AUTO_TUCK_RETRACT_DELAY_MS = 500;
export const MIN_AUTO_TUCK_RETRACT_DELAY_MS = 0;
export const MAX_AUTO_TUCK_RETRACT_DELAY_MS = 3_000;
// Tallest panel before the todo list and other long pages scroll. The default is the
// height the todo page reached before this was a setting (six rows).
export const DEFAULT_MAX_PANEL_HEIGHT = 490;
// The todo page's height with no rows below its two fixed ones.
export const MIN_MAX_PANEL_HEIGHT = 306;
// The tallest expanded height the native window accepts.
export const MAX_MAX_PANEL_HEIGHT = 546;
export const DEFAULT_CLIPBOARD_VISIBLE_ROWS = 6;
export const MIN_CLIPBOARD_VISIBLE_ROWS = 2;
// Six rows is the tallest clipboard page the native window accepts (656px).
export const MAX_CLIPBOARD_VISIBLE_ROWS = 6;
export const DEFAULT_AGENT_VISIBLE_ROWS = 2;
export const MIN_AGENT_VISIBLE_ROWS = 2;
// Five sessions is the tallest Agent page the native window accepts (627px of 656px).
export const MAX_AGENT_VISIBLE_ROWS = 5;
// File shelf cap; matches MAX_ITEMS and MIN / MAX_MAX_ITEMS in src-tauri/src/file_shelf/store.rs.
export const DEFAULT_SHELF_ITEMS = 100;
export const MIN_SHELF_ITEMS = 20;
export const MAX_SHELF_ITEMS = 200;
/** Auto-cleanup choices for the file shelf, in days; 0 never cleans up. */
export const SHELF_CLEANUP_DAYS = [0, 1, 7, 30] as const;
export const DEFAULT_TASK_TEXT_COLOR = "#ffffff";

/** `value` when it is one of `allowed`, else `fallback`: a saved choice from an older or newer build. */
export function oneOf<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}
