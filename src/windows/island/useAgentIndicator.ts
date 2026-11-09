import { useMemo } from "react";
import { getAgentStatusLabel, getAgentVisualState, withoutHiddenProviders } from "../../features/agent-status/status";
import type { AgentStatusSnapshot } from "../../features/agent-status/api";
import type { IslandSettings } from "../../features/appearance/types";
import type { useTranslation } from "../../i18n";

/** The collapsed island's agent light: its colour state and what it reads out. */
export function useAgentIndicator(
  agentStatus: AgentStatusSnapshot,
  settings: IslandSettings,
  activeAgentSessionCount: number,
  t: ReturnType<typeof useTranslation>,
) {
  // Agents switched off in Settings → AI Agent neither light the island nor name it.
  const shownAgentStatus = useMemo(
    () => withoutHiddenProviders(agentStatus, { claudeCode: settings.agentShowClaudeCode, codex: settings.agentShowCodex }),
    [agentStatus, settings.agentShowClaudeCode, settings.agentShowCodex],
  );
  const agentVisualState = useMemo(() => (settings.agentStatusEnabled ? getAgentVisualState(shownAgentStatus, activeAgentSessionCount) : "idle"), [shownAgentStatus, activeAgentSessionCount, settings.agentStatusEnabled]);
  const agentStatusLabel = useMemo(() => getAgentStatusLabel(shownAgentStatus, t, activeAgentSessionCount), [shownAgentStatus, activeAgentSessionCount, t]);
  return { agentVisualState, agentStatusLabel };
}
