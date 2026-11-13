import { useEffect, useMemo, useState } from "react";
import type { SessionFilter } from "./sessionList";
import { getAgentUsage, getCodexUsage, getDshUsage } from "./api";
import { EMPTY_USAGES, withoutPastWindows, type AgentUsages } from "./usage";

/** claude-hud refreshes its snapshot about once a minute; reading local files is cheap. */
const REFRESH_MS = 30_000;
const ALL_SOURCES: SessionFilter = { claudeCode: true, codex: true, dsh: true };

/**
 * Claude's, Codex's and DSH's usage for the Agent page, re-read every 30 seconds while `enabled`.
 * The island reads them even with the page closed, so it can size the page for the lines shown.
 * The caller selects which sources need a read for the rings or alerts.
 */
export function useAgentUsages(enabled: boolean, show: SessionFilter = ALL_SOURCES): AgentUsages {
  const [usages, setUsages] = useState<AgentUsages>(EMPTY_USAGES);
  const showClaude = show.claudeCode !== false;
  const showCodex = show.codex !== false;
  const showDsh = show.dsh !== false;

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
      void Promise.all([
        showClaude ? getAgentUsage().catch(log("Claude")) : Promise.resolve(null),
        showCodex ? getCodexUsage().catch(log("Codex")) : Promise.resolve(null),
        showDsh ? getDshUsage().catch(() => null) : Promise.resolve(null),
      ]).then(([claude, codex, dsh]) => {
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
  }, [enabled, showClaude, showCodex, showDsh]);

  return useMemo(() => ({
    ...usages,
    claude: enabled && showClaude ? usages.claude : null,
    codex: enabled && showCodex ? usages.codex : null,
    dsh: enabled && showDsh ? usages.dsh : null,
  }), [enabled, usages, showClaude, showCodex, showDsh]);
}
