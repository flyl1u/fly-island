import { useCallback, useEffect, useState } from "react";
import { getAgentUsage, type AgentUsage } from "../agent-status/api";
import { refreshClaudeUsage } from "./api";

/** Same pace as the Agent page's usage line: claude-hud rewrites its snapshot about once a minute. */
const REFRESH_MS = 30_000;

/**
 * Claude usage for the ring: what the Agent page reads (`get_agent_usage`: claude-hud's snapshot,
 * or Anthropic's answer when the ring asks it directly), re-read every 30 seconds while `enabled`,
 * and the time it was read for staleness and countdowns. `null` until there is any.
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

  /** Asks Anthropic (when asking directly; throttled natively), then re-reads and restarts the timer. */
  const refresh = useCallback(() => {
    void refreshClaudeUsage()
      .catch((error: unknown) => console.error("Failed to refresh Claude usage", error))
      .finally(() => setNonce((value) => value + 1));
  }, []);

  return { usage, now, refresh };
}
