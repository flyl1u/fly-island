import { AgentAlertSettings } from "../../features/agent-status/AgentAlertSettings";
import { AgentReplyMarkerSettings } from "../../features/agent-status/AgentReplyMarkerSettings";
import type { IslandSettings } from "../../features/appearance/types";

/** Settings → AI Agent → Alerts: when the Agent page pops up and reminds, and the reply status marker that tells it a session waits on you. */
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
      <AgentReplyMarkerSettings />
    </>
  );
}
