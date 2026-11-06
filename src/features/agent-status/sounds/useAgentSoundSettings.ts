import { useEffect, useState } from "react";
import { AGENT_SOUNDS_STORAGE_KEY, loadAgentSoundSettings, saveAgentSoundSettings, type AgentSoundSettings } from "./storage";

/**
 * Agent sound settings, saved on every change and kept in sync between the settings window
 * (where they are edited) and the island (where they play). Writing back a value that came from
 * the other window stores the same string, which fires no further storage event.
 */
export function useAgentSoundSettings() {
  const [settings, setSettings] = useState<AgentSoundSettings>(loadAgentSoundSettings);

  useEffect(() => { saveAgentSoundSettings(settings); }, [settings]);

  useEffect(() => {
    const syncFromOtherWindow = (event: StorageEvent) => {
      if (event.key === AGENT_SOUNDS_STORAGE_KEY) setSettings(loadAgentSoundSettings());
    };
    window.addEventListener("storage", syncFromOtherWindow);
    return () => window.removeEventListener("storage", syncFromOtherWindow);
  }, []);

  return [settings, setSettings] as const;
}
