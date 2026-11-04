import { writeJson } from "../../lib/storage.ts";

// Main island -> settings window request to reveal a section; survives the window being created.
export const SETTINGS_FOCUS_STORAGE_KEY = "focusd-island-settings-focus";

export type SettingsFocusSection = "savePath" | "translation";

export const FOCUS_REQUEST_MAX_AGE_MS = 10_000;

export function takeFocusRequest(): SettingsFocusSection | null {
  const stored = window.localStorage.getItem(SETTINGS_FOCUS_STORAGE_KEY);

  if (stored === null) {
    return null;
  }

  window.localStorage.removeItem(SETTINGS_FOCUS_STORAGE_KEY);

  try {
    const request = JSON.parse(stored) as {
      section?: unknown;
      requestedAt?: unknown;
    };

    return (request.section === "savePath" || request.section === "translation") &&
      typeof request.requestedAt === "number" &&
      Date.now() - request.requestedAt < FOCUS_REQUEST_MAX_AGE_MS
      ? request.section
      : null;
  } catch {
    return null;
  }
}

export function requestSettingsFocus(section: SettingsFocusSection) {
  window.localStorage.setItem(
    SETTINGS_FOCUS_STORAGE_KEY,
    JSON.stringify({ section, requestedAt: Date.now() }),
  );
}

// Settings window -> island: show the island expanded or collapsed while a size slider
// moves, so the change is visible. Each request carries a fresh time, which also makes
// every write a change that fires a storage event in the island window.
export const PANEL_PREVIEW_STORAGE_KEY = "focusd-island-panel-preview";

export type PanelPreviewMode = "expanded" | "collapsed";

// Requests older than this are leftovers from an earlier session, not a slider moving now.
const PANEL_PREVIEW_MAX_AGE_MS = 2_000;

export function requestPanelPreview(mode: PanelPreviewMode) {
  writeJson(PANEL_PREVIEW_STORAGE_KEY, { mode, requestedAt: Date.now() });
}

/** The mode a stored preview request asks for, or null if it is malformed or stale. */
export function parsePanelPreview(stored: string | null, now = Date.now()): PanelPreviewMode | null {
  if (stored === null) {
    return null;
  }

  try {
    const request = JSON.parse(stored) as { mode?: unknown; requestedAt?: unknown };

    return (request.mode === "expanded" || request.mode === "collapsed") &&
      typeof request.requestedAt === "number" &&
      now - request.requestedAt < PANEL_PREVIEW_MAX_AGE_MS
      ? request.mode
      : null;
  } catch {
    return null;
  }
}
