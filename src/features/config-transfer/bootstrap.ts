import { isTauri } from "@tauri-apps/api/core";
import { finishConfigImport, readTransferStartup } from "./api";
import { applyConfigStorage } from "./storage";

/** How long a window waits for the main window to restore an import before starting anyway. */
const RESTORE_WAIT_MS = 5_000;

/**
 * Every window waits; only main writes shared storage, before any stateful React hook runs.
 * Never blocks the start: an error or a restore that does not finish in time starts the window
 * with the storage it has.
 */
export async function restoreConfigBeforeMount(): Promise<void> {
  if (!isTauri()) return;
  const deadline = Date.now() + RESTORE_WAIT_MS;
  try {
    while (Date.now() < deadline) {
      const state = await readTransferStartup();
      if (state.ready) return;
      if (state.localStorage !== null) {
        try {
          applyConfigStorage(state.localStorage);
        } catch (error) {
          console.error("Failed to restore configuration storage", error);
          await finishConfigImport(false);
          return;
        }
        await finishConfigImport(true);
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    console.error("Configuration restore did not finish in time; starting without it");
  } catch (error) {
    console.error("Failed to check for a configuration restore", error);
  }
}
