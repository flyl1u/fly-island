import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { AgentAlertSettings } from "../../features/agent-status/AgentAlertSettings";
import { AgentHooksNotice } from "../../features/agent-status/AgentHooksNotice";
import { AgentQuotaSettings } from "../../features/agent-status/AgentQuotaSettings";
import { ZcodeApiKeySettingsRow } from "../../features/agent-status/ZcodeApiKeySettingsRow";
import { RelayAccountSettingsRow } from "../../features/agent-status/RelayAccountSettingsRow";
import { WorkbuddySignInRow } from "../../features/agent-status/WorkbuddySignInRow";
import { NATIVE_AGENTS, useNativeAgents } from "../../features/agent-status/nativeAgents";
import { AGENT_PROVIDER_LABELS } from "../../features/agent-status/status";
import { PluginIcon } from "../../features/plugins/PluginIcon";
import type { NativePluginId } from "../../features/plugins/native/catalog";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
import { PluginPageGroups } from "./PluginSettingsGroup";

/**
 * Settings → AI Agent → AI sessions: the module switch, the title on the collapsed island,
 * pop-ups, sounds and approving on the island. The hooks are on the Connect AI tools page; what the
 * Agent page lists and how its cards look keep their defaults. Agent plugins follow, one group each.
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
  const native = useNativeAgents(settings);
  /** An installed Agent plugin's own group: its switch and whatever else it needs set. */
  const agentPluginGroup = (id: NativePluginId) => {
    const agent = NATIVE_AGENTS.find((item) => item.id === id);
    if (!agent) return null;
    return <SettingsGroup anchor={agent.id} icon={<PluginIcon id={agent.id} size={16} />} title={AGENT_PROVIDER_LABELS[agent.id]}>
      <SettingsToggleRow title={t.settings.agent.sources.showOnIsland} description={t.settings.agent.sources.native[agent.id]}
        checked={settings[agent.setting]} onChange={(checked) => onSettingsChange({ ...settings, [agent.setting]: checked })} />
      {agent.id === "zcode" && <ZcodeApiKeySettingsRow polling={settings.agentStatusEnabled && native.zcode && (settings.agentQuotaSources.includes("zcode") || settings.agentQuotaAlertPercent > 0)} />}
      {agent.id === "relay" && <RelayAccountSettingsRow polling={settings.agentStatusEnabled && native.relay && (settings.agentQuotaSources.includes("relay") || settings.agentQuotaAlertPercent > 0)} />}
    </SettingsGroup>;
  };

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
      <AgentQuotaSettings sources={settings.agentQuotaSources} offered={(source) => source === "kimiCode" || source === "zcode" || source === "antigravity" || source === "relay" ? native[source] : true}
        onChange={(agentQuotaSources) => onSettingsChange({ ...settings, agentQuotaSources })} />
      <SettingsGroup title={t.settings.agent.sessionTitleSection}>
        <SettingsToggleRow
          title={t.settings.agent.sessionTitle}
          description={t.settings.agent.sessionTitleHint}
          checked={settings.agentTitleEnabled}
          onChange={(agentTitleEnabled) => onSettingsChange({ ...settings, agentTitleEnabled })}
        />
      </SettingsGroup>
      <AgentAlertSettings settings={settings} onSettingsChange={onSettingsChange} />
      <PluginPageGroups page="agents" renderNative={agentPluginGroup} />
    </>
  );
}
