import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { AGENT_SESSION_GROUPS, AGENT_SESSION_SORTS } from "../../features/appearance/settings";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";

/** The Agent page's order and headings (sessionList.ts arrangeSessions). */
export function AgentSessionListSettings({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.agent.sessionList;
  return (
    <SettingsGroup title={text.title}>
      <SettingsRow title={text.sort} control={<SettingsChoice
        value={settings.agentSessionSort}
        ariaLabel={text.sort}
        options={AGENT_SESSION_SORTS.map((value) => ({ value, label: text.sortOptions[value] }))}
        onChange={(agentSessionSort) => onSettingsChange({ ...settings, agentSessionSort })}
      />} />
      <SettingsRow title={text.group} control={<SettingsChoice
        value={settings.agentSessionGroup}
        ariaLabel={text.group}
        options={AGENT_SESSION_GROUPS.map((value) => ({ value, label: text.groupOptions[value] }))}
        onChange={(agentSessionGroup) => onSettingsChange({ ...settings, agentSessionGroup })}
      />} />
    </SettingsGroup>
  );
}
