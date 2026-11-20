export type ConfigBackup = {
  app: "fly-island";
  formatVersion: 1;
  exportedAt: string;
  appVersion: string;
  localStorage: Record<string, string>;
  files: Record<string, unknown>;
};

// The locale key in contracts.md also uses this prefix. Add other app namespaces here,
// never enumerate individual feature keys: future settings must migrate automatically.
export const APP_STORAGE_PREFIXES = ["focusd-island-"] as const;
export const DEVICE_STORAGE_KEYS = ["focusd-island-position"] as const;
export const TRANSIENT_STORAGE_KEYS = [
  "focusd-island-settings-focus", "focusd-island-position-reset", "focusd-island-panel-preview",
] as const;

export function isAppStorageKey(key: string): boolean {
  return APP_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function isTransferableKey(key: string, includeClipboardHistory = true): boolean {
  return isAppStorageKey(key)
    && !DEVICE_STORAGE_KEYS.some((device) => device === key)
    && !TRANSIENT_STORAGE_KEYS.some((transient) => transient === key)
    && (includeClipboardHistory || !key.startsWith("focusd-island-clipboard-history"));
}

export function filterStorage(entries: Record<string, string>, includeClipboardHistory: boolean): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).filter(([key]) => isTransferableKey(key, includeClipboardHistory)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type BackupErrorCode = "invalidJson" | "wrongApp" | "unsupportedVersion" | "invalidStructure";
export class BackupError extends Error {
  readonly code: BackupErrorCode;
  constructor(code: BackupErrorCode) { super(code); this.code = code; }
}

export function validateBackup(value: unknown): ConfigBackup {
  if (!isRecord(value)) throw new BackupError("invalidStructure");
  if (value.app !== "fly-island") throw new BackupError("wrongApp");
  if (value.formatVersion !== 1) throw new BackupError("unsupportedVersion");
  if (typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))
    || typeof value.appVersion !== "string" || !value.appVersion
    || !isRecord(value.localStorage) || !Object.values(value.localStorage).every((item) => typeof item === "string")
    || !isRecord(value.files)) throw new BackupError("invalidStructure");
  return value as ConfigBackup;
}

export function parseBackup(content: string): ConfigBackup {
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new BackupError("invalidJson"); }
  return validateBackup(value);
}
