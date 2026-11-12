import { useEffect, useState } from "react";
import { getAgentUsage, getCodexUsage, getDshUsage } from "./api";
import { EMPTY_USAGES, withoutPastWindows, type AgentUsages } from "./usage";

/** claude-hud refreshes its snapshot about once a minute; reading local files is cheap. */
const REFRESH_MS = 30_000;

/**
 * Claude's and Codex's usage limits for the Agent page, re-read every 30 seconds while `enabled`.
 * The island reads them even with the page closed, so it can size the page for the lines shown.
 */
export function useAgentUsages(enabled: boolean, showDsh = true): AgentUsages {
  const [usages, setUsages] = useState<AgentUsages>(EMPTY_USAGES);

  useEffect(() => {
    if (!enabled) {
      setUsages(EMPTY_USAGES);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      const log = (what: string) => (error: unknown) => {
        console.error(`Failed to read the ${what} usage`, error);
        return null;
      };
      void Promise.all([getAgentUsage().catch(log("Claude")), getCodexUsage().catch(log("Codex")), showDsh ? getDshUsage().catch(() => null) : Promise.resolve(null)]).then(([claude, codex, dsh]) => {
        if (cancelled) return;
        const now = Date.now();
        setUsages({ claude: withoutPastWindows(claude ?? null, now), codex: withoutPastWindows(codex ?? null, now), dsh: dsh ?? null, readAt: now });
      });
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, showDsh]);

  return showDsh ? usages : { ...usages, dsh: null };
}
