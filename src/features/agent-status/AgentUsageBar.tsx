import { Fragment } from "react";
import { useTranslation } from "../../i18n";
import { AgentProviderIcon } from "./AgentProviderIcon";
import type { AgentProvider, AgentUsage, UsageWindow } from "./api";
import { IslandHoverCard } from "../../components/IslandHoverCard";
import { hasUsageNumbers, isStale, tightestWindow, untilReset, usageLevel, usageSourceLines, type AgentUsages } from "./usage";
import { useAgentUsages } from "./useAgentUsages";
import "./AgentUsageBar.css";

/**
 * The Agent page's top lines: Claude's, then Codex's 5-hour and 7-day usage (Claude's per-model
 * windows too) and when the fullest window resets; a line only for an agent that reports numbers.
 * `usages` comes from the island, which sizes the page for the lines; without it the bar reads
 * them itself.
 */
export function AgentUsageBar({ usages: given }: { usages?: AgentUsages }) {
  const own = useAgentUsages(given === undefined);
  const usages = given ?? own;
  return (
    <>
      {hasUsageNumbers(usages.claude) && <UsageLine provider="claudeCode" usage={usages.claude!} now={usages.readAt} />}
      {hasUsageNumbers(usages.codex) && <UsageLine provider="codex" usage={usages.codex!} now={usages.readAt} />}
    </>
  );
}

function UsageLine({ provider, usage, now }: { provider: AgentProvider; usage: AgentUsage; now: number }) {
  const t = useTranslation();
  const windows: [string, UsageWindow][] = [
    ...(usage.fiveHour ? [[t.agent.usage.fiveHour, usage.fiveHour] as [string, UsageWindow]] : []),
    ...(usage.sevenDay ? [[t.agent.usage.sevenDay, usage.sevenDay] as [string, UsageWindow]] : []),
    ...usage.models.map((model): [string, UsageWindow] => [model.name, model]),
  ];
  const tightest = tightestWindow(usage);
  const reset = tightest ? untilReset(tightest.resetsAt, now) : null;
  const stale = isStale(usage, now);

  // Resting on the line names its source and age, as the usage ring's card does. ":scope" puts
  // the card right under this line rather than under the island, which is the whole panel here.
  return (
    <IslandHoverCard lines={usageSourceLines(usage, now, t.claudeUsage)} alignTo=":scope" anchorClassName="agent-usage__hover">
      <div
        className={`agent-usage${stale ? " agent-usage--stale" : ""}`}
        role="status"
        aria-label={provider === "codex" ? t.agent.usage.codexLabel : t.agent.usage.label}
      >
        <AgentProviderIcon provider={provider} size={14} />
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
    </IslandHoverCard>
  );
}
