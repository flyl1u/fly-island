// The beta channel (用户要求 2026-11-18): betas reach no one by themselves. A user asks for one in
// About, and from then on the island checks the beta manifest, which falls back to stable releases
// (src-tauri/src/system/update_channel.rs); "restore" goes back to the latest stable release even
// when it is older. Versions with a pre-release part (3.2.7-beta.1) are betas, as in
// scripts/release/channel.mjs.

/** What the last check looked for. */
export type UpdateTarget = "stable" | "beta" | "restore";

export function isPrereleaseVersion(version: string) {
  return /^\d+\.\d+\.\d+-/.test(version);
}

/** Automatic and manual checks stay on the channel of the version that is running. */
export function automaticTarget(version: string): UpdateTarget {
  return isPrereleaseVersion(version) ? "beta" : "stable";
}

/** The arguments of `updater_check` for a target. */
export function checkArguments(target: UpdateTarget) {
  return { channel: target === "beta" ? "beta" : "stable", allowDowngrade: target === "restore" } as const;
}
