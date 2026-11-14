/** How often automatic updates look for a new version while nothing goes wrong. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Waits after the first, second and third failure in a row; later ones wait the full interval. */
export const RETRY_DELAYS_MS = [60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000] as const;
/** How long the collapsed island must go untouched before a downloaded update installs itself. */
export const IDLE_INSTALL_MS = 2 * 60 * 1000;

/** Delay before the next automatic check, given how many checks in a row have failed. */
export function nextCheckDelay(failures: number) {
  if (failures <= 0) return CHECK_INTERVAL_MS;
  return RETRY_DELAYS_MS[failures - 1] ?? CHECK_INTERVAL_MS;
}
