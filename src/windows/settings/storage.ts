import { readString, writeJson, writeString } from "../../lib/storage.ts";
import type { PanelPreviewMode } from "./panelPreview";
export { parsePanelPreview } from "./panelPreview.ts";
export type { PanelPreviewMode } from "./panelPreview";

// Whether settings open in their own window instead of as a page of the island.
export const DETACHED_SETTINGS_STORAGE_KEY = "focusd-island-detached-settings";

export function loadDetachedSettings(): boolean {
  return readString(DETACHED_SETTINGS_STORAGE_KEY) !== "false";
}

/** Told within the window that saved the choice; other windows get a storage event. */
export const DETACHED_SETTINGS_CHANGED_EVENT = "focusd-detached-settings-changed";

/** Returns false when the choice could not be stored. */
export function saveDetachedSettings(detached: boolean): boolean {
  if (!writeString(DETACHED_SETTINGS_STORAGE_KEY, String(detached))) return false;
  window.dispatchEvent(new Event(DETACHED_SETTINGS_CHANGED_EVENT));
  return true;
}

// Main island -> settings window request to reveal a section; survives the window being created.
export const SETTINGS_FOCUS_STORAGE_KEY = "focusd-island-settings-focus";

export type SettingsFocusSection = "savePath" | "translation" | "music" | "mail" | "updates";

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

    return (request.section === "savePath" || request.section === "translation" || request.section === "music" || request.section === "mail" || request.section === "updates") &&
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

// Settings window -> island: put the island back at the top center of the primary
// screen, as its own reset button does. The time makes every request a change that
// fires a storage event, and lets a leftover from an earlier session be ignored.
export const ISLAND_POSITION_RESET_STORAGE_KEY = "focusd-island-position-reset";

const POSITION_RESET_MAX_AGE_MS = 5_000;

export function requestIslandPositionReset() {
  writeJson(ISLAND_POSITION_RESET_STORAGE_KEY, { requestedAt: Date.now() });
}

/** Whether a stored reset request is fresh and well formed. */
export function isFreshPositionReset(stored: string | null, now = Date.now()) {
  if (stored === null) {
    return false;
  }

  try {
    const request = JSON.parse(stored) as { requestedAt?: unknown };
    return typeof request.requestedAt === "number" && now - request.requestedAt < POSITION_RESET_MAX_AGE_MS;
  } catch {
    return false;
  }
}

// Settings window -> island: show the island expanded or collapsed while a size slider
// moves, so the change is visible. Each request carries a fresh time, which also makes
// every write a change that fires a storage event in the island window.
export const PANEL_PREVIEW_STORAGE_KEY = "focusd-island-panel-preview";

export function requestPanelPreview(mode: PanelPreviewMode) {
  writeJson(PANEL_PREVIEW_STORAGE_KEY, { mode, requestedAt: Date.now() });
}
