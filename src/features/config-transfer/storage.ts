import { readString, removeItem, writeString } from "../../lib/storage.ts";
import { filterStorage, isTransferableKey } from "./format.ts";

/** The migration feature alone enumerates storage; values still use the safe lib functions. */
function storageKeys(): string[] {
  try {
    return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => key !== null);
  } catch { throw new Error("storageUnavailable"); }
}

export function collectConfigStorage(includeClipboardHistory: boolean): Record<string, string> {
  const entries = storageKeys().filter((key) => isTransferableKey(key, includeClipboardHistory)).map((key) => {
    const value = readString(key);
    if (value === null) throw new Error("storageUnavailable");
    return [key, value] as const;
  });
  return Object.fromEntries(entries);
}

/** Called before React mounts on the fresh process, while all other windows wait. */
export function applyConfigStorage(entries: Record<string, string>): void {
  const previous = collectConfigStorage(true);
  const next = filterStorage(entries, true);
  const replace = (data: Record<string, string>) => {
    for (const key of storageKeys().filter((key) => isTransferableKey(key) && !(key in data))) {
      if (!removeItem(key)) return false;
    }
    for (const [key, value] of Object.entries(data)) if (!writeString(key, value)) return false;
    return true;
  };
  if (!replace(next)) {
    if (!replace(previous)) throw new Error("storageRollbackFailed");
    throw new Error("storageUnavailable");
  }
}
