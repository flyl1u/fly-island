import { AgentAlertSettings } from "../../features/agent-status/AgentAlertSettings";
import { AgentPushSettings } from "../../features/agent-status/push/AgentPushSettings";
import type { IslandSettings } from "../../features/appearance/types";

/** Settings → AI Agent → Alerts: when the Agent page pops up and reminds, and pushes to the phone. */
export function AgentAlertsSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  return (
    <>
      <AgentAlertSettings settings={settings} onSettingsChange={onSettingsChange} />
      <AgentPushSettings />
    </>
  );
}
