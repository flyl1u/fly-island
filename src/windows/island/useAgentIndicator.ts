import { useMemo } from "react";
import { getAgentPhaseLabel, getAgentStatusLabel, getAgentVisualState, withoutHiddenProviders } from "../../features/agent-status/status";
import { isSessionWaiting } from "../../features/agent-status/sessionList";
import type { AgentSessionSummary, AgentStatusSnapshot } from "../../features/agent-status/api";
import type { IslandSettings } from "../../features/appearance/types";
import type { useTranslation } from "../../i18n";

/** The collapsed island's agent light: its colour state and what it reads out. */
export function useAgentIndicator(
  agentStatus: AgentStatusSnapshot,
  settings: IslandSettings,
  activeAgentSessionCount: number,
  agentSessions: AgentSessionSummary[],
  t: ReturnType<typeof useTranslation>,
) {
  // Agents switched off in Settings → AI Agent neither light the island nor name it.
  const shownAgentStatus = useMemo(
    () => withoutHiddenProviders(agentStatus, { claudeCode: settings.agentShowClaudeCode, codex: settings.agentShowCodex }),
    [agentStatus, settings.agentShowClaudeCode, settings.agentShowCodex],
  );
  const hasWaitingSession = agentSessions.some(isSessionWaiting);
  const agentVisualState = settings.agentStatusEnabled ? getAgentVisualState(shownAgentStatus, activeAgentSessionCount, hasWaitingSession) : "idle";
  const agentStatusLabel = agentVisualState === "waiting" ? getAgentPhaseLabel("waiting", t) : getAgentStatusLabel(shownAgentStatus, t, activeAgentSessionCount);
  return { agentVisualState, agentStatusLabel };
}
