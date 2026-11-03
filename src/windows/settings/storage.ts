// Main island -> settings window request to reveal a section; survives the window being created.
export const SETTINGS_FOCUS_STORAGE_KEY = "focusd-island-settings-focus";

export type SettingsFocusSection = "savePath";

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

    return request.section === "savePath" &&
      typeof request.requestedAt === "number" &&
      Date.now() - request.requestedAt < FOCUS_REQUEST_MAX_AGE_MS
      ? request.section
      : null;
  } catch {
    return null;
  }
}
