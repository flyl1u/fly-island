import { readString, removeItem, writeString } from "../../lib/storage.ts";
import { isLegacyStorageKey } from "../../shared/storage/legacyMigration.ts";
import { FIRST_LAUNCH_STORAGE } from "./defaults.ts";

export const FIRST_LAUNCH_DEFAULTS_KEY = "fly-island-first-launch-defaults-v1";

/** Any app data identifies an existing user, even if their settings are missing or invalid. */
function hasExistingProfile(): boolean {
  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key && (key.startsWith("fly-island-") || isLegacyStorageKey(key))) return true;
    }
    return false;
  } catch {
    // Unavailable storage cannot establish that the user is new.
    return true;
  }
}

/** Called under a shared Web Lock, after legacy migration and configuration restore. */
export function seedFirstLaunchDefaults(): boolean {
  const state = readString(FIRST_LAUNCH_DEFAULTS_KEY);
  // A secondary window may seed first; main still needs to apply native preferences.
  if (state === "pending") return true;
  if (state !== null || hasExistingProfile()) return false;

  const written: string[] = [];
  const entries = [...Object.entries(FIRST_LAUNCH_STORAGE), [FIRST_LAUNCH_DEFAULTS_KEY, "pending"]];
  for (const [key, value] of entries) {
    if (!writeString(key, value)) {
      for (const previous of written.reverse()) removeItem(previous);
      return false;
    }
    written.push(key);
  }
  return true;
}

/** Main consumes this once, so later starts never reapply native preferences. */
export function completeFirstLaunchDefaults(): boolean {
  return writeString(FIRST_LAUNCH_DEFAULTS_KEY, "complete");
}
