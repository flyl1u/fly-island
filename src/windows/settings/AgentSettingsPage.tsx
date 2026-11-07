import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { AgentSessionListSettings } from "../../features/agent-status/AgentSessionListSettings";
import { AgentSessionFilterSettings } from "../../features/agent-status/AgentSessionFilterSettings";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

/**
 * Settings → AI Agent → Sessions: the module switch, the title on the collapsed island, and what
 * the Agent page lists. Alerts, sounds, approvals and the hooks have their own pages in the group.
 */
export function AgentSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.agents}
        checked={settings.agentStatusEnabled}
        onChange={(agentStatusEnabled) => onSettingsChange({ ...settings, agentStatusEnabled })}
      />
      <SettingsGroup title={t.settings.agent.sessionTitleSection}>
        <SettingsToggleRow
          title={t.settings.agent.sessionTitle}
          description={t.settings.agent.sessionTitleHint}
          checked={settings.agentTitleEnabled}
          onChange={(agentTitleEnabled) => onSettingsChange({ ...settings, agentTitleEnabled })}
        />
      </SettingsGroup>
      <AgentSessionListSettings settings={settings} onSettingsChange={onSettingsChange} />
      <AgentSessionFilterSettings />
    </>
  );
}
