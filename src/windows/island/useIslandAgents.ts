import type { IslandSettings } from "../../features/appearance/types";
import { useAgentStatus } from "../../features/agent-status/useAgentStatus";
import { useAgentSession } from "../../features/agent-status/useAgentSession";
import { useIslandAgentSessions } from "../../features/agent-status/useIslandAgentSessions";
import { useAgentUsages } from "../../features/agent-status/useAgentUsages";

/**
 * The agent status, the island's agent sessions, the one the collapsed island names, and Claude's
 * and Codex's usage limits for the Agent page.
 */
export function useIslandAgents(settings: IslandSettings) {
  const agentStatus = useAgentStatus(settings.agentStatusEnabled);
  const sessions = useIslandAgentSessions(settings);
  const others = agentStatus.others;
  const agentSession = useAgentSession(
    sessions.agentSessions,
    others,
    settings.agentStatusEnabled && settings.agentTitleEnabled,
  );

  // Read with the page closed too: the page is sized for the usage lines it will show, and the
  // usage alert (agentQuotaAlertPercent) watches them.
  const agentUsages = useAgentUsages(settings.agentStatusEnabled && (settings.agentShowUsage || settings.agentQuotaAlertPercent > 0), settings.agentShowDsh);

  return { agentStatus, ...sessions, agentSession, agentUsages };
}
