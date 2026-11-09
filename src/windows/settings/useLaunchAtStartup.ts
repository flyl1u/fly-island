import { useCallback, useEffect, useState } from "react";
import { readLaunchAtStartup, saveLaunchAtStartup } from "./api";

/** The launch-at-startup registry value, updated optimistically and rolled back on failure. */
export function useLaunchAtStartup() {
  const [launchAtStartup, setLaunchAtStartup] = useState(false);

  useEffect(() => {
    void readLaunchAtStartup()
      .then(setLaunchAtStartup)
      .catch((error) => {
        console.error("Failed to read launch at startup", error);
      });
  }, []);

  const updateLaunchAtStartup = useCallback(async (enabled: boolean) => {
    setLaunchAtStartup(enabled);

    try {
      await saveLaunchAtStartup(enabled);
    } catch (error) {
      console.error("Failed to update launch at startup", error);
      setLaunchAtStartup(!enabled);
    }
  }, []);

  return [launchAtStartup, updateLaunchAtStartup] as const;
}
