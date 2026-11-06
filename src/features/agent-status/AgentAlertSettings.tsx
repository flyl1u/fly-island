import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { AGENT_ALERT_SECONDS } from "../appearance/settings";
import type { AgentAlertStarted, IslandSettings } from "../appearance/types";

/** Settings → AI Agent: which session events open the Agent page, and for how long. */
export function AgentAlertSettings({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.agent.alerts;
  const update = (patch: Partial<IslandSettings>) => onSettingsChange({ ...settings, ...patch });
  const anyOn = settings.agentAlertStarted !== "off" || settings.agentAlertCompleted || settings.agentAlertFailed || settings.agentAlertWaiting;
  const secondsOptions = AGENT_ALERT_SECONDS.map((seconds) => ({ value: String(seconds), label: text.secondsValue(seconds) }));
  const startedOptions = (["everyTurn", "newSession", "off"] as const).map((value) => ({ value, label: text.startedOptions[value] }));

  return (
    <SettingsGroup title={text.title} footer={text.hint}>
      <SettingsRow
        title={text.started}
        control={
          <SettingsSelect
            value={settings.agentAlertStarted}
            options={startedOptions}
            ariaLabel={text.started}
            onChange={(value) => update({ agentAlertStarted: value as AgentAlertStarted })}
          />
        }
      />
      <SettingsToggleRow title={text.waiting} checked={settings.agentAlertWaiting} onChange={(agentAlertWaiting) => update({ agentAlertWaiting })} />
      <SettingsToggleRow title={text.completed} checked={settings.agentAlertCompleted} onChange={(agentAlertCompleted) => update({ agentAlertCompleted })} />
      <SettingsToggleRow title={text.failed} checked={settings.agentAlertFailed} onChange={(agentAlertFailed) => update({ agentAlertFailed })} />
      {anyOn && (
        <SettingsRow
          title={text.seconds}
          control={
            <SettingsSelect
              value={String(settings.agentAlertSeconds)}
              options={secondsOptions}
              ariaLabel={text.seconds}
              onChange={(value) => update({ agentAlertSeconds: Number(value) })}
            />
          }
        />
      )}
    </SettingsGroup>
  );
}
