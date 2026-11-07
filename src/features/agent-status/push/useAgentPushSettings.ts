import { useEffect, useState } from "react";
import { AGENT_PUSH_STORAGE_KEY, loadAgentPushSettings, saveAgentPushSettings, type AgentPushSettings } from "./storage";

/** Phone push settings, saved on every change and kept in sync between the settings window and the island. */
export function useAgentPushSettings() {
  const [settings, setSettings] = useState<AgentPushSettings>(loadAgentPushSettings);

  useEffect(() => { saveAgentPushSettings(settings); }, [settings]);

  useEffect(() => {
    const syncFromOtherWindow = (event: StorageEvent) => {
      if (event.key === AGENT_PUSH_STORAGE_KEY) setSettings(loadAgentPushSettings());
    };
    window.addEventListener("storage", syncFromOtherWindow);
    return () => window.removeEventListener("storage", syncFromOtherWindow);
  }, []);

  return [settings, setSettings] as const;
}
