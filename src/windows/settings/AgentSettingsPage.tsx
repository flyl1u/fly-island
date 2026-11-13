import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { AgentAlertSettings } from "../../features/agent-status/AgentAlertSettings";
import { AgentHooksNotice } from "../../features/agent-status/AgentHooksNotice";
import { AgentQuotaSettings } from "../../features/agent-status/AgentQuotaSettings";
import { WorkbuddySignInRow } from "../../features/agent-status/WorkbuddySignInRow";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

/**
 * Settings → AI Agent → AI sessions: the module switch, the title on the collapsed island,
 * pop-ups, sounds and approving on the island. The hooks are on the Connect AI tools page; what the
 * Agent page lists and how its cards look keep their defaults.
 */
export function AgentSettingsPage({
  settings,
  onSettingsChange,
  onOpenConnect,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  /** Opens the Connect AI tools page, where the hooks are installed. */
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
      {/* The hooks live on the Connect AI tools page; most of what follows needs them. */}
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
        <SettingsToggleRow
          title={t.settings.agent.sources.workbuddy}
          description={t.settings.agent.sources.workbuddyHint}
          checked={settings.agentShowWorkbuddy}
          onChange={(agentShowWorkbuddy) => onSettingsChange({ ...settings, agentShowWorkbuddy })}
        />
        {settings.agentShowWorkbuddy && <WorkbuddySignInRow polling={settings.agentStatusEnabled && settings.agentQuotaSources.includes("workbuddy")} />}
      </SettingsGroup>
      <AgentQuotaSettings sources={settings.agentQuotaSources} onChange={(agentQuotaSources) => onSettingsChange({ ...settings, agentQuotaSources })} />
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
