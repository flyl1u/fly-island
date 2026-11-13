import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { AgentAlertSettings } from "../../features/agent-status/AgentAlertSettings";
import { AgentHooksNotice } from "../../features/agent-status/AgentHooksNotice";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

/**
 * Settings → AI Agent → Sessions & alerts: the module switch, the title on the collapsed island,
 * pop-ups, sounds and approving on the island. The hooks are on the Connection page; what the
 * Agent page lists and how its cards look keep their defaults.
 */
export function AgentSettingsPage({
  settings,
  onSettingsChange,
  onOpenConnect,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  /** Opens the Connection page, where the hooks are installed. */
  onOpenConnect: () => void;
}) {
  const t = useTranslation();

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.agents}
        checked={settings.agentStatusEnabled}
        onChange={(agentStatusEnabled) => onSettingsChange({ ...settings, agentStatusEnabled })}
      />
      {/* The hooks live on the Connection page; most of what follows needs them. */}
      <AgentHooksNotice onOpenConnect={onOpenConnect} />
      <SettingsGroup title={t.settings.agent.sources.title}>
        <SettingsToggleRow
          title={t.settings.agent.sources.claudeCode}
          description={t.settings.agent.sources.claudeCodeHint}
          checked={settings.agentShowClaudeCode}
          onChange={(agentShowClaudeCode) => onSettingsChange({ ...settings, agentShowClaudeCode })}
        />
        <SettingsToggleRow
          title={t.settings.agent.sources.codex}
          description={t.settings.agent.sources.codexHint}
          checked={settings.agentShowCodex}
          onChange={(agentShowCodex) => onSettingsChange({ ...settings, agentShowCodex })}
        />
        <SettingsToggleRow title={t.settings.agent.sources.dsh} description={t.settings.agent.sources.dshHint} checked={settings.agentShowDsh} onChange={(agentShowDsh) => onSettingsChange({ ...settings, agentShowDsh })} />
      </SettingsGroup>
      <SettingsGroup title={t.settings.agent.sessionTitleSection}>
        <SettingsToggleRow
          title={t.settings.agent.sessionTitle}
          description={t.settings.agent.sessionTitleHint}
          checked={settings.agentTitleEnabled}
          onChange={(agentTitleEnabled) => onSettingsChange({ ...settings, agentTitleEnabled })}
        />
      </SettingsGroup>
      <AgentAlertSettings settings={settings} onSettingsChange={onSettingsChange} />
    </>
  );
}
