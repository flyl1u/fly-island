import { useEffect, useMemo, useState } from "react";
import type { SessionFilter } from "./sessionList";
import { dshProblem, getAgentUsage, getCodexUsage, getDshUsage, getKimiUsage, getZcodeUsage } from "./api";
import { EMPTY_USAGES, withoutPastWindows, type AgentUsages } from "./usage";
import { usePlugins } from "../plugins";

/** claude-hud refreshes its snapshot about once a minute; reading local files is cheap. */
const REFRESH_MS = 30_000;
const ALL_SOURCES: SessionFilter = { claudeCode: true, codex: true, dsh: true };

/**
 * Claude's, Codex's and DSH's usage for the Agent page, re-read every 30 seconds while `enabled`.
 * The island reads them even with the page closed, so it can size the page for the lines shown.
 * The caller selects which sources need a read for the rings or alerts.
 */
export function useAgentUsages(enabled: boolean, show: SessionFilter = ALL_SOURCES): AgentUsages {
  const plugins = usePlugins();
  const [usages, setUsages] = useState<AgentUsages>(EMPTY_USAGES);
  const showClaude = show.claudeCode !== false;
  const showCodex = show.codex !== false;
  const showDsh = show.dsh !== false;
  // Plugin-market agents are asked only when the caller names them: they query a web service.
  const showKimi = show.kimiCode === true;
  const showZcode = show.zcode === true;

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
        showDsh ? getDshUsage().then((usage) => ({ usage, problem: null }), (error: unknown) => ({ usage: null, problem: dshProblem(error) })) : Promise.resolve(null),
        showKimi ? getKimiUsage().catch(log("Kimi Code")) : Promise.resolve(null),
        showZcode ? getZcodeUsage().catch(log("Z Code")) : Promise.resolve(null),
      ]).then(([claude, codex, dsh, kimi, zcode]) => {
        if (cancelled) return;
        const now = Date.now();
        setUsages({
          claude: withoutPastWindows(claude ?? null, now),
          codex: withoutPastWindows(codex ?? null, now),
          dsh: dsh?.usage ?? null,
          dshProblem: dsh?.problem ?? null,
          kimi: withoutPastWindows(kimi ?? null, now),
          zcode: withoutPastWindows(zcode ?? null, now),
          readAt: now,
        });
      });
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, showClaude, showCodex, showDsh, showKimi, showZcode]);

  return useMemo(() => ({
    ...usages,
    claude: enabled && showClaude ? usages.claude : null,
    codex: enabled && showCodex ? usages.codex : null,
    dsh: enabled && showDsh ? usages.dsh : null,
    dshProblem: enabled && showDsh ? usages.dshProblem : null,
    kimi: enabled && showKimi ? usages.kimi : null,
    zcode: enabled && showZcode ? usages.zcode : null,
    plugins: enabled ? Object.entries(plugins.live).flatMap(([id, live]) => plugins.registry.installed[id]?.enabled && live.status === "running" ? live.quota.map((q) => ({ ...q, id: `${id}/${q.id}` })) : []) : [],
  }), [enabled, usages, showClaude, showCodex, showDsh, showKimi, showZcode, plugins]);
}
