import { readString, writeString } from "../../lib/storage.ts";

export type UpdateChannel = "stable" | "beta";

const CHANNEL_KEY = "focusd-island-update-channel";

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
