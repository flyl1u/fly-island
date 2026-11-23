import { useCallback, useEffect, useState } from "react";
import { readLaunchAtStartup, readLaunchAtStartupDisabled, saveLaunchAtStartup } from "./api";

/** The launch-at-startup registry value, updated optimistically and rolled back on failure. */
export function useLaunchAtStartup() {
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [disabledByTaskManager, setDisabledByTaskManager] = useState(false);

  useEffect(() => {
    void readLaunchAtStartup().then(setLaunchAtStartup).catch((error) => {
      console.error("Failed to read launch at startup", error);
    });
    void readLaunchAtStartupDisabled().then(setDisabledByTaskManager).catch((error) => {
      console.error("Failed to read launch-at-startup status", error);
    });
  }, []);

  const updateLaunchAtStartup = useCallback(async (enabled: boolean) => {
    setLaunchAtStartup(enabled);

    try {
      await saveLaunchAtStartup(enabled);
      if (!enabled) {
        setDisabledByTaskManager(false);
      } else {
        try {
          setDisabledByTaskManager(await readLaunchAtStartupDisabled());
        } catch (error) {
          console.error("Failed to refresh launch-at-startup status", error);
        }
      }
    } catch (error) {
      console.error("Failed to update launch at startup", error);
      setLaunchAtStartup(!enabled);
    }
  }, []);

  return [launchAtStartup, updateLaunchAtStartup, disabledByTaskManager] as const;
}
