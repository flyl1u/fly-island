import { readString, writeString, removeItem } from "../../../lib/storage.ts";
export const SETTINGS_KEY = "focusd-island-qq-mail-settings";
export const REMOTE_IMAGES_KEY = "focusd-island-qq-mail-remote-images";

export type MailSettings = { email: string; enabled: boolean };

export function loadSettings(): MailSettings | null {
  try {
    const stored = JSON.parse(readString(SETTINGS_KEY) ?? "null") as Partial<MailSettings> | null;
    return typeof stored?.email === "string" && typeof stored.enabled === "boolean"
      ? { email: stored.email, enabled: stored.enabled } : null;
  } catch { return null; }
}

export function loadRemoteImagePreference() {
  try { return readString(REMOTE_IMAGES_KEY) === "true"; } catch { return false; }
}

export function saveRemoteImagePreference(allow: boolean) {
  try { writeString(REMOTE_IMAGES_KEY, String(allow)); } catch { /* 偏好保存失败不影响本次阅读 */ }
}

export function saveMailSettings(settings: MailSettings) {
  writeString(SETTINGS_KEY, JSON.stringify({ email: settings.email, enabled: settings.enabled }));
}

export function clearMailSettings() {
  removeItem(SETTINGS_KEY);
}
