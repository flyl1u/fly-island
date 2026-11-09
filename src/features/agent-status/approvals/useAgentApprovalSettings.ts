import { useEffect, useState } from "react";
import { AGENT_APPROVAL_STORAGE_KEY, loadAgentApprovalSettings, saveAgentApprovalSettings, type AgentApprovalSettings } from "./storage";

/**
 * Whether permission requests are approved on the island, saved on every change and kept in sync
 * between the settings window (where it is switched) and the island (which tells the endpoint).
 */
export function useAgentApprovalSettings() {
  const [settings, setSettings] = useState<AgentApprovalSettings>(loadAgentApprovalSettings);

  useEffect(() => { saveAgentApprovalSettings(settings); }, [settings]);

  useEffect(() => {
    const syncFromOtherWindow = (event: StorageEvent) => {
      if (event.key === AGENT_APPROVAL_STORAGE_KEY) setSettings(loadAgentApprovalSettings());
    };
    window.addEventListener("storage", syncFromOtherWindow);
    return () => window.removeEventListener("storage", syncFromOtherWindow);
  }, []);

  return [settings, setSettings] as const;
}
