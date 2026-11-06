import type { IslandSettings } from "../../features/appearance/types";
import { useAgentStatus } from "../../features/agent-status/useAgentStatus";
import { useAgentSession } from "../../features/agent-status/useAgentSession";
import { useIslandAgentSessions } from "../../features/agent-status/useIslandAgentSessions";

/** The agent status, the island's agent sessions, and the one the collapsed island names. */
export function useIslandAgents(settings: IslandSettings) {
  const agentStatus = useAgentStatus(settings.agentStatusEnabled);
  const sessions = useIslandAgentSessions(settings);
  const agentSession = useAgentSession(
    sessions.agentSessions,
    agentStatus.others,
    settings.agentStatusEnabled && settings.agentTitleEnabled,
  );

  return { agentStatus, ...sessions, agentSession };
}
