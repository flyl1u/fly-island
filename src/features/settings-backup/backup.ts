// Settings backups: which localStorage keys are settings, the file format, and checking a file
// before anything is restored. Pure; storage.ts does the reading and writing.

/**
 * The keys a backup holds: preferences only. Todos live in todos.json; window positions, saved
 * credentials (Windows Credential Manager), one-off requests between windows and migration
 * markers stay out, so restoring on another computer cannot break anything.
 */
export const BACKUP_KEYS = [
  "focusd-island-settings",
  "focusd-island-setting-presets",
  "focusd-island-locale",
  "focusd-island-translation-settings",
  "focusd-island-music-sources",
  "focusd-island-qq-notifications-enabled",
  "focusd-island-wechat-reminders-enabled",
  "focusd-island-qq-mail-settings",
  "focusd-island-qq-mail-remote-images",
  "focusd-island-plugin-pages",
  "focusd-island-save-directory",
  "focusd-island-update-channel",
  "focusd-island-update-preferences",
  // Imported sound packs themselves stay in the app data folder; only the choices travel.
  "focusd-island-agent-sounds",
] as const;

export type BackupKey = (typeof BACKUP_KEYS)[number];

export type SettingsBackup = {
  app: "fly-island";
  version: 1;
  exportedAt: string;
  /** Stored text of each key that was set, as localStorage holds it. */
  keys: Partial<Record<BackupKey, string>>;
};

export type BackupProblem = "notJson" | "notBackup" | "newerVersion" | "empty";

export function isBackupKey(key: string): key is BackupKey {
  return (BACKUP_KEYS as readonly string[]).includes(key);
}

/** The backup of everything `read` returns for the backup keys. */
export function buildBackup(read: (key: BackupKey) => string | null, now: Date): SettingsBackup {
  const keys: SettingsBackup["keys"] = {};
  for (const key of BACKUP_KEYS) {
    const value = read(key);
    if (value !== null) keys[key] = value;
  }
  return { app: "fly-island", version: 1, exportedAt: now.toISOString(), keys };
}

/** "fly-island-settings-2026-11-06-1430.json", in local time. */
export function backupFileName(now: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `fly-island-settings-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

/**
 * The keys to restore from a backup file's text, or why it cannot be restored. Unknown keys and
 * non-text values are dropped; each value is checked again by its own page's normalize on load.
 */
export function parseBackup(text: string): { keys: Partial<Record<BackupKey, string>> } | { problem: BackupProblem } {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { problem: "notJson" };
  }
  if (typeof value !== "object" || value === null) return { problem: "notBackup" };
  const backup = value as Record<string, unknown>;
  if (backup.app !== "fly-island" || typeof backup.keys !== "object" || backup.keys === null) {
    return { problem: "notBackup" };
  }
  if (typeof backup.version !== "number" || backup.version > 1) return { problem: "newerVersion" };
  const keys: Partial<Record<BackupKey, string>> = {};
  for (const [key, stored] of Object.entries(backup.keys)) {
    if (isBackupKey(key) && typeof stored === "string") keys[key] = stored;
  }
  return Object.keys(keys).length > 0 ? { keys } : { problem: "empty" };
}
