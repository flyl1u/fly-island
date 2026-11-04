import { useEffect, useRef, useState } from "react";
import { listAgentSessions, type AgentSessionSummary } from "./api";
import { sameAgentSessions } from "./sessionList";

const NO_SESSIONS: AgentSessionSummary[] = [];

/**
 * Recent agent sessions, re-read every `intervalMs` while `enabled`. Keeps the previous array
 * when nothing changed so the island does not re-render on every poll.
 */
export function useAgentSessions(enabled: boolean, intervalMs: number) {
  const [sessions, setSessions] = useState<AgentSessionSummary[]>(NO_SESSIONS);
  const isLoading = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setSessions(NO_SESSIONS);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      if (isLoading.current) return;
      isLoading.current = true;
      try {
        const next = await listAgentSessions();
        if (!cancelled) setSessions((current) => (sameAgentSessions(current, next) ? current : next));
      } catch (error) {
        console.error("Failed to list agent sessions", error);
      } finally {
        isLoading.current = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs]);

  return sessions;
}
