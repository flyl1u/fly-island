import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { AgentSessionListSettings } from "../../features/agent-status/AgentSessionListSettings";
import { AgentSessionFilterSettings } from "../../features/agent-status/AgentSessionFilterSettings";
import { AgentAlertSettings } from "../../features/agent-status/AgentAlertSettings";
import { AgentApprovalSettings } from "../../features/agent-status/approvals/AgentApprovalSettings";
import { AgentReplyMarkerSettings } from "../../features/agent-status/AgentReplyMarkerSettings";
import { AgentHooksSettingsSection } from "../../features/agent-status/AgentHooksSettingsSection";
import { useAgentStatusSettings } from "../../features/agent-status/useAgentStatusSettings";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

export function AgentSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  // Owned by the page so agent status is only polled while it is open.
  const agentStatus = useAgentStatusSettings();

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.agents}
        checked={settings.agentStatusEnabled}
        onChange={(agentStatusEnabled) => onSettingsChange({ ...settings, agentStatusEnabled })}
      />
      {/* Installing the hooks comes first: most of what follows needs them. */}
      <AgentHooksSettingsSection {...agentStatus} />
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
      <AgentAlertSettings settings={settings} onSettingsChange={onSettingsChange} />
      <AgentApprovalSettings />
      <AgentReplyMarkerSettings />
    </>
  );
}
