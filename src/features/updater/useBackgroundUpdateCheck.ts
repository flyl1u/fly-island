import { useEffect, useSyncExternalStore } from "react";
import { CHANNEL_KEY, UPDATE_PREFERENCES_KEY } from "./storage";
import {
  checkInBackground,
  getUpdateState,
  reloadPreferences,
  reminderVersion,
  subscribeToUpdate,
} from "./updaterController";

// Wait a little after launch so the check never competes with the island starting up.
const FIRST_CHECK_DELAY_MS = 20_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** The island's update checks: shortly after launch, then every six hours. */
export function useBackgroundUpdateCheck() {
  useEffect(() => {
    const first = window.setTimeout(() => void checkInBackground(), FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => void checkInBackground(), CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);

  // The settings window turns auto-check off, skips a version or switches the channel.
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === UPDATE_PREFERENCES_KEY || event.key === CHANNEL_KEY) reloadPreferences();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
}

/** The newer version to remind about on the island, or null. */
export function useUpdateReminder() {
  return useSyncExternalStore(subscribeToUpdate, () => reminderVersion(getUpdateState()));
}
