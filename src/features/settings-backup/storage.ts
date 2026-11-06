import { readString, writeString } from "../../lib/storage.ts";
import { buildBackup, type BackupKey, type SettingsBackup } from "./backup.ts";

/** The current settings as a backup. */
export function collectBackup(now = new Date()): SettingsBackup {
  return buildBackup((key) => readString(key), now);
}

/**
 * Writes restored settings; returns how many keys were written. Other windows hear about each
 * key through `storage` events; this window does not, so the same events are sent here too,
 * and the pages reload what they show instead of saving their old state over it.
 */
export function restoreBackup(keys: Partial<Record<BackupKey, string>>) {
  let written = 0;
  for (const [key, value] of Object.entries(keys)) {
    if (typeof value !== "string") continue;
    const oldValue = readString(key);
    if (!writeString(key, value)) continue;
    written += 1;
    window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue: value, storageArea: window.localStorage }));
  }
  return written;
}
