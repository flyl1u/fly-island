export const SETTINGS_KEY = "focusd-island-qq-mail-settings";
export const REMOTE_IMAGES_KEY = "focusd-island-qq-mail-remote-images";

export type MailSettings = { email: string; enabled: boolean };

export function loadSettings(): MailSettings | null {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<MailSettings> | null;
    return typeof stored?.email === "string" && typeof stored.enabled === "boolean"
      ? { email: stored.email, enabled: stored.enabled } : null;
  } catch { return null; }
}

export function loadRemoteImagePreference() {
  try { return localStorage.getItem(REMOTE_IMAGES_KEY) === "true"; } catch { return false; }
}

export function saveRemoteImagePreference(allow: boolean) {
  try { localStorage.setItem(REMOTE_IMAGES_KEY, String(allow)); } catch { /* 偏好保存失败不影响本次阅读 */ }
}
