import { SettingsGroup } from "../../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../../i18n";
import { useAgentApprovalSettings } from "./useAgentApprovalSettings";

/** Settings → AI Agent: whether agents' permission requests wait for a card on the island. */
export function AgentApprovalSettings() {
  const text = useTranslation().settings.agent.approval;
  const [settings, setSettings] = useAgentApprovalSettings();

  return (
    <SettingsGroup title={text.title} footer={text.hint}>
      <SettingsToggleRow title={text.onIsland} checked={settings.onIsland} onChange={(onIsland) => setSettings({ onIsland })} />
    </SettingsGroup>
  );
}
