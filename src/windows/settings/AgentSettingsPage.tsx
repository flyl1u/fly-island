import { NumberControl } from "../../components/controls/NumberControl";
import { SelectControl } from "../../components/controls/SelectControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { AGENT_HOST_DISPLAYS, MAX_AGENT_VISIBLE_ROWS, MIN_AGENT_VISIBLE_ROWS } from "../../features/appearance/settings";
import { AgentHooksSettingsSection } from "../../features/agent-status/AgentHooksSettingsSection";
import { useAgentStatusSettings } from "../../features/agent-status/useAgentStatusSettings";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
// The label-beside-dropdown row is shared with the file shelf page.
import "./ShelfSettingsPage.css";

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
      <section className="settings-section settings-section--agent-sessions">
        <div className="settings-section__header">
          <span>{t.settings.agent.sessionPageSection}</span>
        </div>
        <NumberControl
          label={t.settings.agent.sessionVisibleRows}
          value={settings.agentVisibleRows}
          min={MIN_AGENT_VISIBLE_ROWS}
          max={MAX_AGENT_VISIBLE_ROWS}
          onChange={(agentVisibleRows) => onSettingsChange({ ...settings, agentVisibleRows })}
        />
        <p className="settings-section__hint">{t.settings.agent.sessionPageHint}</p>
        <div className="shelf-settings__row">
          <span>{t.settings.agent.hostDisplay}</span>
          <SelectControl
            value={settings.agentHostDisplay}
            options={AGENT_HOST_DISPLAYS.map((value) => ({ value, label: t.settings.agent.hostDisplayOptions[value] }))}
            ariaLabel={t.settings.agent.hostDisplay}
            onChange={(agentHostDisplay) => onSettingsChange({ ...settings, agentHostDisplay })}
          />
        </div>
        <p className="settings-section__hint">{t.settings.agent.hostDisplayHint}</p>
      </section>
      <AgentHooksSettingsSection {...agentStatus} />
    </>
  );
}
