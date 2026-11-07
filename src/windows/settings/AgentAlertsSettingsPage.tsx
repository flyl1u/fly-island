import { AgentAlertSettings } from "../../features/agent-status/AgentAlertSettings";
import type { IslandSettings } from "../../features/appearance/types";

/** Settings → AI Agent → Alerts: when the Agent page pops up and reminds. */
export function AgentAlertsSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  return <AgentAlertSettings settings={settings} onSettingsChange={onSettingsChange} />;
}
