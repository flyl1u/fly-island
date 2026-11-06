import { readString, writeString, removeItem } from "../../lib/storage.ts";
export const DETACHED_SETTINGS_STORAGE_KEY = "focusd-island-detached-settings";
export const SETTINGS_PRESENTATION_CHANGED = "settings-presentation-changed";

export function loadDetachedSettings(): boolean {
  return readString(DETACHED_SETTINGS_STORAGE_KEY) === "true";
}

export function saveDetachedSettings(detached: boolean): boolean {
  if (!writeString(DETACHED_SETTINGS_STORAGE_KEY, String(detached))) return false;
  window.dispatchEvent(new Event(SETTINGS_PRESENTATION_CHANGED));
  return true;
}
// Main island -> settings window request to reveal a section; survives the window being created.
export const SETTINGS_FOCUS_CHANGED = "settings-focus-changed";
export const SETTINGS_FOCUS_STORAGE_KEY = "focusd-island-settings-focus";

export type SettingsFocusSection = "savePath";

export const FOCUS_REQUEST_MAX_AGE_MS = 10_000;

export function takeFocusRequest(): SettingsFocusSection | null {
  const stored = readString(SETTINGS_FOCUS_STORAGE_KEY);

  if (stored === null) {
    return null;
  }

  removeItem(SETTINGS_FOCUS_STORAGE_KEY);

  try {
    const request = JSON.parse(stored) as {
      section?: unknown;
      requestedAt?: unknown;
    };

    return request.section === "savePath" &&
      typeof request.requestedAt === "number" &&
      Date.now() - request.requestedAt < FOCUS_REQUEST_MAX_AGE_MS
      ? request.section
      : null;
  } catch {
    return null;
  }
}

export function requestSettingsFocus(section: SettingsFocusSection) {
  writeString(
    SETTINGS_FOCUS_STORAGE_KEY,
    JSON.stringify({ section, requestedAt: Date.now() }),
  );
  window.dispatchEvent(new Event(SETTINGS_FOCUS_CHANGED));
}
