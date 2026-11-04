import { useEffect, useMemo, useState } from "react";
import type { AgentStatusSnapshot } from "./api";
import { agentSessionExpiresAt, pickAgentSession, type AgentSession } from "./session";

/** The agent session to name on the collapsed island, or null; re-checks when a completed title expires. */
export function useAgentSession(snapshot: AgentStatusSnapshot, enabled: boolean): AgentSession | null {
  const [now, setNow] = useState(() => Date.now());

  // A new snapshot is the moment its phases changed, so measure the completed hold from here.
  useEffect(() => {
    setNow(Date.now());
  }, [snapshot]);

  useEffect(() => {
    if (!enabled) return;
    const expiresAt = agentSessionExpiresAt(snapshot, now);
    if (expiresAt === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [enabled, now, snapshot]);

  return useMemo(
    () => (enabled ? pickAgentSession(snapshot, now) : null),
    [enabled, now, snapshot],
  );
}
