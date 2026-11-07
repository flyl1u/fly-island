import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import {
  AGENT_HOST_DISPLAYS,
  AGENT_SESSION_HOURS,
  AGENT_SESSION_VIEWS,
  MAX_AGENT_VISIBLE_ROWS,
  MIN_AGENT_VISIBLE_ROWS,
} from "../appearance/settings";
import type { AgentHostDisplay, AgentSessionView, IslandSettings } from "../appearance/types";
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
  type Toggle = "agentHideFinished" | "agentHideClosed" | "agentShowUsage" | "agentShowElapsed" | "agentShowModel" | "agentShowActivity" | "agentShowClaudeCode" | "agentShowCodex";
  const toggle = (key: Toggle, title: string, description?: string) => (
    <SettingsToggleRow title={title} description={description} checked={settings[key]} onChange={(value) => update({ [key]: value })} />
  );

  return (
    <>
      <SettingsGroup title={text.sessionPageSection}>
        <SettingsNumberRow
          title={text.sessionVisibleRows}
          description={text.sessionPageHint}
          value={settings.agentVisibleRows}
          min={MIN_AGENT_VISIBLE_ROWS}
          max={MAX_AGENT_VISIBLE_ROWS}
          onChange={(agentVisibleRows) => update({ agentVisibleRows })}
        />
        <SettingsRow
          title={text.sessionHours}
          description={text.sessionHoursHint}
          control={
            <SettingsSelect
              value={String(settings.agentSessionHours)}
              options={AGENT_SESSION_HOURS.map((hours) => ({ value: String(hours), label: text.sessionHoursOption(hours) }))}
              ariaLabel={text.sessionHours}
              onChange={(hours) => update({ agentSessionHours: Number(hours) })}
            />
          }
        />
        {toggle("agentHideFinished", text.hideFinished, text.hideFinishedHint)}
        {toggle("agentHideClosed", text.hideClosed, text.hideClosedHint)}
        {toggle("agentShowUsage", text.showUsage, text.showUsageHint)}
      </SettingsGroup>
      <SettingsGroup title={text.sessionCardSection}>
        <SettingsRow
          title={text.sessionView}
          description={text.sessionViewHint}
          control={
            <SettingsSelect<AgentSessionView>
              value={settings.agentSessionView}
              options={AGENT_SESSION_VIEWS.map((value) => ({ value, label: text.sessionViewOptions[value] }))}
              ariaLabel={text.sessionView}
              onChange={(agentSessionView) => update({ agentSessionView })}
            />
          }
        />
        <SettingsRow
          title={text.hostDisplay}
          description={text.hostDisplayHint}
          control={
            <SettingsSelect<AgentHostDisplay>
              value={settings.agentHostDisplay}
              options={AGENT_HOST_DISPLAYS.map((value) => ({ value, label: text.hostDisplayOptions[value] }))}
              ariaLabel={text.hostDisplay}
              onChange={(agentHostDisplay) => update({ agentHostDisplay })}
            />
          }
        />
        {toggle("agentShowModel", text.showModel)}
        {toggle("agentShowActivity", text.showActivity, text.showActivityHint)}
        {toggle("agentShowElapsed", text.showElapsed, text.showElapsedHint)}
      </SettingsGroup>
      <SettingsGroup title={text.agentsSection} footer={text.showAgentsHint}>
        {toggle("agentShowClaudeCode", text.showClaudeCode)}
        {toggle("agentShowCodex", text.showCodex)}
      </SettingsGroup>
    </>
  );
}
