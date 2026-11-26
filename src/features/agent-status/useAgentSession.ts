import { useMemo } from "react";
import type { AgentSessionSummary, ExternalAgentStatus } from "./api";
import { pickAgentSession, type AgentSession } from "./session";

/**
 * The running or waiting agent session to name on the collapsed island, or null.
 */
export function useAgentSession(
  sessions: AgentSessionSummary[],
  others: ExternalAgentStatus[] | undefined,
  enabled: boolean,
): AgentSession | null {
  return useMemo(
    () => (enabled ? pickAgentSession(sessions, others) : null),
    [enabled, others, sessions],
  );
}
