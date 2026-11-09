import { useMemo } from "react";
import type { IslandSettings } from "../appearance/types";
import { countActiveSessions, filterSessions, isActivePhase } from "./sessionList";
import { useAgentSessions } from "./useAgentSessions";
import { useHiddenSessions } from "./useHiddenSessions";
import { useUnseenSessions } from "./useUnseenSessions";

type AgentSessionSettings = Pick<
  IslandSettings,
  "agentStatusEnabled" | "agentSessionHours" | "agentShowClaudeCode" | "agentShowCodex" | "agentHideFinished" | "agentHideClosed"
>;

/**
 * The island's agent sessions: all shown ones, the ones the Agent page lists, the running count,
 * the unseen ones, and removing one from the page.
 */
export function useIslandAgentSessions(settings: AgentSessionSettings) {
  // Read every second: the collapsed island names sessions from it and holds a finished one's
  // title for three seconds after its file last changed. Answered from a cache in about 1 ms.
  const allAgentSessions = useAgentSessions(settings.agentStatusEnabled, 1000, settings.agentSessionHours);
  // Hidden agents are left out of the page, the count, the collapsed title, alerts and sounds.
  const shownAgentSessions = useMemo(
    () => filterSessions(allAgentSessions, { claudeCode: settings.agentShowClaudeCode, codex: settings.agentShowCodex }),
    [allAgentSessions, settings.agentShowClaudeCode, settings.agentShowCodex],
  );
  // Sessions removed from the Agent page leave the count and the collapsed island too.
  const { visible: agentSessions, removal: agentRemoval } = useHiddenSessions(shownAgentSessions);
  const listedAgentSessions = useMemo(
    () =>
      agentSessions.filter(
        (session) => (!settings.agentHideFinished || isActivePhase(session.phase)) && !(settings.agentHideClosed && session.closed),
      ),
    [agentSessions, settings.agentHideFinished, settings.agentHideClosed],
  );
  const activeAgentSessionCount = countActiveSessions(agentSessions);
  const unseenAgentSessions = useUnseenSessions(agentSessions, settings.agentStatusEnabled);
  return { agentSessions, listedAgentSessions, activeAgentSessionCount, unseenAgentSessions, agentRemoval };
}
