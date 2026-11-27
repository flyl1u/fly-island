import { isTauri } from "@tauri-apps/api/core";
import { setClipboardHistorySettings } from "../../features/clipboard/api.ts";
import { setAppLogEnabled } from "../../features/diagnostics/api.ts";
import { captureFirstLaunch } from "../../features/onboarding/firstLaunch.ts";
import { FIRST_LAUNCH_APP_LOG_ENABLED, FIRST_LAUNCH_CLIPBOARD } from "../../features/onboarding/defaults.ts";
import { completeFirstLaunchDefaults, seedFirstLaunchDefaults } from "../../features/onboarding/storage.ts";

/** All windows finish initialization before reading settings; only main changes native preferences. */
export async function initializeFirstLaunchDefaults(mainWindow: boolean): Promise<void> {
  const initialize = async () => {
    const firstLaunch = seedFirstLaunchDefaults();
    captureFirstLaunch(firstLaunch);
    if (!mainWindow || !firstLaunch) return;
    // Consume before the asynchronous calls: a restart must never overwrite a later user choice.
    if (!completeFirstLaunchDefaults()) return;
    if (!isTauri()) return;
    const results = await Promise.allSettled([
      setClipboardHistorySettings(FIRST_LAUNCH_CLIPBOARD),
      setAppLogEnabled(FIRST_LAUNCH_APP_LOG_ENABLED),
    ]);
    for (const result of results) {
      if (result.status === "rejected") console.error("Failed to initialize new-user preferences", result.reason);
    }
  };
  // Main and the hidden translation window are created together and share localStorage.
  if (navigator.locks) await navigator.locks.request("fly-island-first-launch-defaults", initialize);
  else await initialize();
}
