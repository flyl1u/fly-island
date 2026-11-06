import { useMemo } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { useAgentStatus } from "../../features/agent-status/useAgentStatus";
import { useAgentSession } from "../../features/agent-status/useAgentSession";
import { useIslandAgentSessions } from "../../features/agent-status/useIslandAgentSessions";
import { isRemoteSessionReport } from "../../features/agent-status/remoteSessions";
import { useAgentUsages } from "../../features/agent-status/useAgentUsages";

/**
 * The agent status, the island's agent sessions, the one the collapsed island names, and every
 * agent's phase for the center pattern's pet, and Claude's and Codex's usage limits for the Agent page.
 */
export function useIslandAgents(settings: IslandSettings) {
  const agentStatus = useAgentStatus(settings.agentStatusEnabled);
  const sessions = useIslandAgentSessions(settings, agentStatus.others);
  // Reports from other computers are among the sessions already; the rest stay as reports.
  const others = useMemo(() => agentStatus.others?.filter((report) => !isRemoteSessionReport(report)), [agentStatus.others]);
  const agentSession = useAgentSession(
    sessions.agentSessions,
    others,
    settings.agentStatusEnabled && settings.agentTitleEnabled,
  );
  // Every session and reported agent, finished ones included: the center pattern's pet acts them out.
  const agentActivity = useMemo(
    () => [...sessions.agentSessions, ...(others ?? [])],
    [sessions.agentSessions, others],
  );

  // Read with the page closed too: the page is sized for the usage lines it will show.
  const agentUsages = useAgentUsages(settings.agentStatusEnabled && settings.agentShowUsage);

  return { agentStatus, ...sessions, agentSession, agentActivity, agentUsages };
}
