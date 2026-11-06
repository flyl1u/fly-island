import { useMemo } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { useAgentStatus } from "../../features/agent-status/useAgentStatus";
import { useAgentSession } from "../../features/agent-status/useAgentSession";
import { useIslandAgentSessions } from "../../features/agent-status/useIslandAgentSessions";

/**
 * The agent status, the island's agent sessions, the one the collapsed island names, and every
 * agent's phase for the center pattern's pet.
 */
export function useIslandAgents(settings: IslandSettings) {
  const agentStatus = useAgentStatus(settings.agentStatusEnabled);
  const sessions = useIslandAgentSessions(settings);
  const agentSession = useAgentSession(
    sessions.agentSessions,
    agentStatus.others,
    settings.agentStatusEnabled && settings.agentTitleEnabled,
  );
  // Every session and reported agent, finished ones included: the center pattern's pet acts them out.
  const agentActivity = useMemo(
    () => [...sessions.agentSessions, ...(agentStatus.others ?? [])],
    [sessions.agentSessions, agentStatus.others],
  );

  return { agentStatus, ...sessions, agentSession, agentActivity };
}
