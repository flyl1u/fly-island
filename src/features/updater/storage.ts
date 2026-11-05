import { readJson, readString, writeJson, writeString } from "../../lib/storage.ts";

export type UpdateChannel = "stable" | "beta";

export const CHANNEL_KEY = "focusd-island-update-channel";
export const UPDATE_PREFERENCES_KEY = "focusd-island-update-preferences";

/** A pre-release version such as 0.3.1-beta.1. */
export function isPrerelease(version: string) {
  return /^\d+\.\d+\.\d+-/.test(version);
}

/**
 * The channel the user picked. Without a choice, a pre-release build stays on
 * the beta channel (someone installed it on purpose) and every other build is
 * on stable, so nobody gets a beta without asking for one.
 */
export function normalizeUpdateChannel(stored: unknown, version: string): UpdateChannel {
  if (stored === "stable" || stored === "beta") return stored;
  return isPrerelease(version) ? "beta" : "stable";
}

export function loadUpdateChannel(version: string): UpdateChannel {
  return normalizeUpdateChannel(readString(CHANNEL_KEY), version);
}

export function saveUpdateChannel(channel: UpdateChannel) {
  writeString(CHANNEL_KEY, channel);
}

export type UpdatePreferences = {
  /** Check in the background at startup and every few hours. */
  autoCheck: boolean;
  /** A version the user chose to skip; the island does not remind about it. */
  skippedVersion: string | null;
  /** When a check last succeeded, in ms since the epoch. */
  lastCheckedAt: number | null;
};

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = {
  autoCheck: true,
  skippedVersion: null,
  lastCheckedAt: null,
};

export function normalizeUpdatePreferences(stored: unknown): UpdatePreferences {
  if (typeof stored !== "object" || stored === null) return DEFAULT_UPDATE_PREFERENCES;
  const value = stored as Record<string, unknown>;
  return {
    autoCheck: value.autoCheck !== false,
    skippedVersion: typeof value.skippedVersion === "string" && value.skippedVersion ? value.skippedVersion : null,
    lastCheckedAt: typeof value.lastCheckedAt === "number" && Number.isFinite(value.lastCheckedAt) ? value.lastCheckedAt : null,
  };
}

export function loadUpdatePreferences(): UpdatePreferences {
  return normalizeUpdatePreferences(readJson(UPDATE_PREFERENCES_KEY));
}

export function saveUpdatePreferences(patch: Partial<UpdatePreferences>): UpdatePreferences {
  const next = { ...loadUpdatePreferences(), ...patch };
  writeJson(UPDATE_PREFERENCES_KEY, next);
  return next;
}
