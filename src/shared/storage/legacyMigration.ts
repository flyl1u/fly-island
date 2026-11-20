/** One-time WebView localStorage migration for installations created before the rename. */
const LEGACY_STORAGE_PREFIX = "focusd-island-";
const CURRENT_STORAGE_PREFIX = "fly-island-";

export function isLegacyStorageKey(key: string): boolean {
  return key.startsWith(LEGACY_STORAGE_PREFIX);
}

export function toCurrentStorageKey(key: string): string {
  return isLegacyStorageKey(key)
    ? `${CURRENT_STORAGE_PREFIX}${key.slice(LEGACY_STORAGE_PREFIX.length)}`
    : key;
}

/** Exposed for compatibility tests without copying the legacy spelling into feature code. */
export function legacyStorageKey(suffix: string): string {
  return `${LEGACY_STORAGE_PREFIX}${suffix}`;
}

export function isLegacyBackupApp(value: unknown): boolean {
  return value === "focusd" || value === "focusd-island";
}

/** Compatibility fixture for import tests; callers never write this value to a backup. */
export function legacyBackupAppValue(): string {
  return "focusd-island";
}

/**
 * Copies each former key only when its current counterpart is absent, then removes the former
 * entry. A failed write leaves the source in place so the next window or launch can retry.
 */
export function migrateLegacyStorage(storage: Storage = window.localStorage): void {
  let keys: string[];
  try {
    keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => key !== null && isLegacyStorageKey(key));
  } catch {
    return;
  }
  for (const legacyKey of keys) {
    const currentKey = toCurrentStorageKey(legacyKey);
    try {
      const value = storage.getItem(legacyKey);
      if (value === null) continue;
      if (storage.getItem(currentKey) === null) {
        storage.setItem(currentKey, value);
      }
      storage.removeItem(legacyKey);
    } catch {
      // Storage can be full or blocked. Keep the source for a later retry.
    }
  }
}
