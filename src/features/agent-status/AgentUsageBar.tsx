import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { getAgentUsage, type AgentUsage, type UsageWindow } from "./api";
import { isStale, tightestWindow, untilReset, usageLevel } from "./usage";
import "./AgentUsageBar.css";

/** claude-hud refreshes its snapshot about once a minute; reading a local file is cheap. */
const REFRESH_MS = 30_000;

/**
 * The Agent page's top line: Claude's 5-hour and 7-day usage, per-model windows and when the
 * fullest one resets. Nothing when there is no usage snapshot (no claude-hud, an API key login).
 */
export function AgentUsageBar() {
  const t = useTranslation();
  const [usage, setUsage] = useState<AgentUsage | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getAgentUsage()
        .then((next) => {
          if (!cancelled) {
            setUsage(next);
            setNow(Date.now());
          }
        })
        .catch((error: unknown) => console.error("Failed to read the agent usage", error));
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // No numbers yet (asking Anthropic directly before its first answer, or after a failure).
  if (!usage || (!usage.fiveHour && !usage.sevenDay && usage.models.length === 0)) return null;
  const windows: [string, UsageWindow][] = [
    ...(usage.fiveHour ? [[t.agent.usage.fiveHour, usage.fiveHour] as [string, UsageWindow]] : []),
    ...(usage.sevenDay ? [[t.agent.usage.sevenDay, usage.sevenDay] as [string, UsageWindow]] : []),
    ...usage.models.map((model): [string, UsageWindow] => [model.name, model]),
  ];
  const tightest = tightestWindow(usage);
  const reset = tightest ? untilReset(tightest.resetsAt, now) : null;
  const stale = isStale(usage, now);

  return (
    <div className={`agent-usage${stale ? " agent-usage--stale" : ""}`} role="status" aria-label={t.agent.usage.label}>
      <AgentProviderIcon provider="claudeCode" size={14} />
      {windows.map(([label, window], index) => (
        <Fragment key={`${label}:${index}`}>
          {index > 0 && <span className="agent-usage__divider" aria-hidden="true" />}
          <span className="agent-usage__window">
            <span className="agent-usage__label">{label}</span>
            <strong className={`agent-usage__value agent-usage__value--${usageLevel(window.used)}`}>{Math.round(window.used)}%</strong>
          </span>
        </Fragment>
      ))}
      {reset && <span className="agent-usage__reset">{t.agent.usage.resetsIn(reset)}</span>}
      {stale && <span className="agent-usage__reset">{t.agent.usage.stale}</span>}
    </div>
  );
}
