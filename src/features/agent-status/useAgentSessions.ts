import { useEffect, useRef, useState } from "react";
import { isIslandMoving } from "../../lib/islandMotion";
import { listAgentSessions, type AgentSessionSummary, type NativeAgentProvider } from "./api";
import { sameAgentSessions, uniqueSessions } from "./sessionList";

const NO_SESSIONS: AgentSessionSummary[] = [];
const NONE: readonly NativeAgentProvider[] = [];

/**
 * Recent agent sessions, re-read every `intervalMs` while `enabled`. Keeps the previous array
 * when nothing changed so the island does not re-render on every poll. `native`: the
 * plugin-market agents to read as well.
 */
export function useAgentSessions(enabled: boolean, intervalMs: number, windowHours?: number, native: readonly NativeAgentProvider[] = NONE) {
  const nativeKey = native.join(",");
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
        const sources = nativeKey ? nativeKey.split(",") as NativeAgentProvider[] : [];
        const next = uniqueSessions(await listAgentSessions(windowHours, sources));
        if (!cancelled) setSessions((current) => (sameAgentSessions(current, next) ? current : next));
      } catch (error) {
        console.error("Failed to list agent sessions", error);
      } finally {
        isLoading.current = false;
      }
    };
    void refresh();
    // A change waits out the island's motion (islandMotion.ts): it re-renders the whole island.
    const timer = window.setInterval(() => {
      if (!isIslandMoving()) void refresh();
    }, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, windowHours, nativeKey]);

  return sessions;
}
