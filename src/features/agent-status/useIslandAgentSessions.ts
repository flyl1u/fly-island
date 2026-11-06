import { useMemo } from "react";
import type { IslandSettings } from "../appearance/types";
import type { ExternalAgentStatus } from "./api";
import { remoteSessions, withRemoteSessions } from "./remoteSessions";
import { countActiveSessions, filterSessions, isActivePhase } from "./sessionList";
import { useAgentSessions } from "./useAgentSessions";
import { useHiddenSessions } from "./useHiddenSessions";
import { applySessionFilters } from "./sessionFilters";
import { useSessionFilters } from "./useSessionFilters";
import { useUnseenSessions } from "./useUnseenSessions";

type AgentSessionSettings = Pick<
  IslandSettings,
  "agentStatusEnabled" | "agentSessionHours" | "agentShowClaudeCode" | "agentShowCodex" | "agentHideFinished"
>;

/**
 * The island's agent sessions: all shown ones, the ones the Agent page lists, the running count,
 * the unseen ones, and removing one from the page.
 */
export function useIslandAgentSessions(settings: AgentSessionSettings, others?: ExternalAgentStatus[]) {
  // Read every second: the collapsed island names sessions from it and holds a finished one's
  // title for three seconds after its file last changed. Answered from a cache in about 1 ms.
  const localAgentSessions = useAgentSessions(settings.agentStatusEnabled, 1000, settings.agentSessionHours);
  // Sessions on other computers, reported by a plugin or over the local API.
  const allAgentSessions = useMemo(
    () => withRemoteSessions(localAgentSessions, settings.agentStatusEnabled ? remoteSessions(others) : []),
    [localAgentSessions, others, settings.agentStatusEnabled],
  );
  // Agents switched off in Settings → AI Agent, and sessions its rules hide, are left out of
  // the page, the count, the collapsed title, alerts and sounds.
  const [sessionFilters] = useSessionFilters();
  const shownAgentSessions = useMemo(
    () => applySessionFilters(filterSessions(allAgentSessions, { claudeCode: settings.agentShowClaudeCode, codex: settings.agentShowCodex }), sessionFilters),
    [allAgentSessions, settings.agentShowClaudeCode, settings.agentShowCodex, sessionFilters],
  );
  // Sessions removed from the Agent page leave the count and the collapsed island too.
  const { visible: agentSessions, removal: agentRemoval } = useHiddenSessions(shownAgentSessions);
  const listedAgentSessions = useMemo(
    () => (settings.agentHideFinished ? agentSessions.filter((session) => isActivePhase(session.phase)) : agentSessions),
    [agentSessions, settings.agentHideFinished],
  );
  const activeAgentSessionCount = countActiveSessions(agentSessions);
  const unseenAgentSessions = useUnseenSessions(agentSessions, settings.agentStatusEnabled);
  return { agentSessions, listedAgentSessions, activeAgentSessionCount, unseenAgentSessions, agentRemoval };
}
