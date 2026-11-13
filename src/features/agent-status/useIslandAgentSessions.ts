import { useMemo } from "react";
import type { IslandSettings } from "../appearance/types";
import { countActiveSessions, filterSessions, isActivePhase } from "./sessionList";
import { useAgentSessions } from "./useAgentSessions";
import { useHiddenSessions } from "./useHiddenSessions";
import { useUnseenSessions } from "./useUnseenSessions";

type AgentSessionSettings = Pick<
  IslandSettings,
  "agentStatusEnabled" | "agentSessionHours" | "agentShowClaudeCode" | "agentShowCodex" | "agentShowDsh" | "agentShowWorkbuddy" | "agentHideFinished"
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
    () => filterSessions(allAgentSessions, { claudeCode: settings.agentShowClaudeCode, codex: settings.agentShowCodex, dsh: settings.agentShowDsh, workbuddy: settings.agentShowWorkbuddy }),
    [allAgentSessions, settings.agentShowClaudeCode, settings.agentShowCodex, settings.agentShowDsh, settings.agentShowWorkbuddy],
  );
  // Sessions removed from the Agent page leave the count and the collapsed island too.
  const { visible: agentSessions, removal: agentRemoval } = useHiddenSessions(shownAgentSessions);
  // A session that ended within the window stays listed as finished: Claude Code and DSH know at
  // once that their app quit, while Codex only says so after half an hour, and one list is better
  // than three different rules. Archiving still removes a row by hand.
  const listedAgentSessions = useMemo(
    () => agentSessions.filter((session) => !settings.agentHideFinished || isActivePhase(session.phase)),
    [agentSessions, settings.agentHideFinished],
  );
  const activeAgentSessionCount = countActiveSessions(agentSessions);
  const unseenAgentSessions = useUnseenSessions(agentSessions, settings.agentStatusEnabled);
  return { agentSessions, listedAgentSessions, activeAgentSessionCount, unseenAgentSessions, agentRemoval };
}
