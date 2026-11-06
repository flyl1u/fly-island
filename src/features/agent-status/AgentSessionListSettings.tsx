import { NumberControl } from "../../components/controls/NumberControl";
import { SelectControl } from "../../components/controls/SelectControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import {
  AGENT_HOST_DISPLAYS,
  AGENT_SESSION_HOURS,
  MAX_AGENT_VISIBLE_ROWS,
  MIN_AGENT_VISIBLE_ROWS,
} from "../appearance/settings";
import type { IslandSettings } from "../appearance/types";
import { useTranslation } from "../../i18n";

/** Settings → AI Agent: which sessions the island's Agent page lists, and what each card shows. */
export function AgentSessionListSettings({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.agent;
  const update = (patch: Partial<IslandSettings>) => onSettingsChange({ ...settings, ...patch });

  return (
    <>
      <section className="settings-section settings-section--agent-sessions">
        <div className="settings-section__header">
          <span>{text.sessionPageSection}</span>
        </div>
        <NumberControl
          label={text.sessionVisibleRows}
          value={settings.agentVisibleRows}
          min={MIN_AGENT_VISIBLE_ROWS}
          max={MAX_AGENT_VISIBLE_ROWS}
          onChange={(agentVisibleRows) => update({ agentVisibleRows })}
        />
        <p className="settings-section__hint">{text.sessionPageHint}</p>
        <div className="shelf-settings__row">
          <span>{text.sessionHours}</span>
          <SelectControl
            value={String(settings.agentSessionHours)}
            options={AGENT_SESSION_HOURS.map((hours) => ({ value: String(hours), label: text.sessionHoursOption(hours) }))}
            ariaLabel={text.sessionHours}
            onChange={(hours) => update({ agentSessionHours: Number(hours) })}
          />
        </div>
        <p className="settings-section__hint">{text.sessionHoursHint}</p>
        <ToggleControl
          label={text.hideFinished}
          checked={settings.agentHideFinished}
          onChange={(agentHideFinished) => update({ agentHideFinished })}
        />
        <p className="settings-section__hint">{text.hideFinishedHint}</p>
        <ToggleControl
          label={text.showClaudeCode}
          checked={settings.agentShowClaudeCode}
          onChange={(agentShowClaudeCode) => update({ agentShowClaudeCode })}
        />
        <ToggleControl
          label={text.showCodex}
          checked={settings.agentShowCodex}
          onChange={(agentShowCodex) => update({ agentShowCodex })}
        />
        <p className="settings-section__hint">{text.showAgentsHint}</p>
      </section>
      <section className="settings-section settings-section--agent-cards">
        <div className="settings-section__header">
          <span>{text.sessionCardSection}</span>
        </div>
        <div className="shelf-settings__row">
          <span>{text.hostDisplay}</span>
          <SelectControl
            value={settings.agentHostDisplay}
            options={AGENT_HOST_DISPLAYS.map((value) => ({ value, label: text.hostDisplayOptions[value] }))}
            ariaLabel={text.hostDisplay}
            onChange={(agentHostDisplay) => update({ agentHostDisplay })}
          />
        </div>
        <p className="settings-section__hint">{text.hostDisplayHint}</p>
        <ToggleControl
          label={text.showElapsed}
          checked={settings.agentShowElapsed}
          onChange={(agentShowElapsed) => update({ agentShowElapsed })}
        />
        <p className="settings-section__hint">{text.showElapsedHint}</p>
        <ToggleControl
          label={text.showModel}
          checked={settings.agentShowModel}
          onChange={(agentShowModel) => update({ agentShowModel })}
        />
        <ToggleControl
          label={text.showActivity}
          checked={settings.agentShowActivity}
          onChange={(agentShowActivity) => update({ agentShowActivity })}
        />
        <p className="settings-section__hint">{text.showActivityHint}</p>
      </section>
    </>
  );
}
