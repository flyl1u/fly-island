import type { UpdateStage } from "./updaterController";

/** A running island checks again this often, so one kept open for days still hears of updates. */
export const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * After a failed check, retry sooner. Autostart often runs before the network is up, and a single
 * failed startup check used to leave the update todo hidden until the next restart.
 */
export const RETRY_DELAYS_MS = [2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];

/** Milliseconds until the next automatic check, or null when none is needed (found, busy, off). */
export function nextCheckDelay(stage: UpdateStage, failures: number): number | null {
  if (stage === "latest") return RECHECK_INTERVAL_MS;
  if (stage !== "error") return null;
  return RETRY_DELAYS_MS[Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1];
}
