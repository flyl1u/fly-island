import { ToggleControl } from "../../components/controls/ToggleControl";
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
      <section className="settings-section settings-section--agent-title">
        <div className="settings-section__header">
          <span>{t.settings.agent.sessionTitleSection}</span>
        </div>
        <ToggleControl
          label={t.settings.agent.sessionTitle}
          checked={settings.agentTitleEnabled}
          onChange={(agentTitleEnabled) => onSettingsChange({ ...settings, agentTitleEnabled })}
        />
        <p className="settings-section__hint">{t.settings.agent.sessionTitleHint}</p>
      </section>
      <AgentHooksSettingsSection {...agentStatus} />
    </>
  );
}
