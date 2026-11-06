import { useMemo } from "react";
import type { IslandSettings } from "../appearance/types";
import { countActiveSessions, filterSessions, isActivePhase } from "./sessionList";
import { useAgentSessions } from "./useAgentSessions";
import { useUnseenSessions } from "./useUnseenSessions";

type AgentSessionSettings = Pick<
  IslandSettings,
  "agentStatusEnabled" | "agentSessionHours" | "agentShowClaudeCode" | "agentShowCodex" | "agentHideFinished"
>;

/** The island's agent sessions: all shown ones, the ones the Agent page lists, the running count and the unseen ones. */
export function useIslandAgentSessions(settings: AgentSessionSettings) {
  // Read every second: the collapsed island names sessions from it and holds a finished one's
  // title for three seconds after its file last changed. Answered from a cache in about 1 ms.
  const allAgentSessions = useAgentSessions(settings.agentStatusEnabled, 1000, settings.agentSessionHours);
  // Agents switched off in Settings → AI Agent are left out of the page and the count.
  const agentSessions = useMemo(
    () => filterSessions(allAgentSessions, { claudeCode: settings.agentShowClaudeCode, codex: settings.agentShowCodex }),
    [allAgentSessions, settings.agentShowClaudeCode, settings.agentShowCodex],
  );
  const listedAgentSessions = useMemo(
    () => (settings.agentHideFinished ? agentSessions.filter((session) => isActivePhase(session.phase)) : agentSessions),
    [agentSessions, settings.agentHideFinished],
  );
  const activeAgentSessionCount = countActiveSessions(agentSessions);
  const unseenAgentSessions = useUnseenSessions(agentSessions, settings.agentStatusEnabled);
  return { agentSessions, listedAgentSessions, activeAgentSessionCount, unseenAgentSessions };
}
