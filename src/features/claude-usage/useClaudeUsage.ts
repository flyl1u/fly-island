import { useCallback, useEffect, useState } from "react";
import { getAgentUsage, type AgentUsage } from "../agent-status/api";

/** Same pace as the Agent page's usage line: claude-hud rewrites its snapshot about once a minute. */
const REFRESH_MS = 30_000;

/**
 * Claude usage for the ring: the claude-hud snapshot the Agent page reads (`get_agent_usage`),
 * re-read every 30 seconds while `enabled`, and the time it was read for staleness and countdowns.
 * `null` until there is a snapshot (no claude-hud, or an API key login).
 */
export function useClaudeUsage(enabled = true) {
  const [usage, setUsage] = useState<AgentUsage | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const read = () => {
      void getAgentUsage()
        .then((next) => {
          if (!cancelled) {
            setUsage(next);
            setNow(Date.now());
          }
        })
        .catch((error: unknown) => console.error("Failed to read Claude usage", error));
    };
    read();
    const timer = window.setInterval(read, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, nonce]);

  /** Reads the snapshot now and restarts the 30-second timer. */
  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  return { usage, now, refresh };
}
