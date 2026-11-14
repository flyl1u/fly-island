import { useTranslation } from "../../i18n";
import { IslandHoverCard, type HoverCardLine } from "../../components/IslandHoverCard";
import type { AgentProvider, AgentUsage } from "./api";
import { isStale, percentLeft, quotaRings, quotaSummaries, usageLineCount, usageSourceLines, windowLabel, windowSummary, type AgentUsages } from "./usage";
import { useAgentUsages } from "./useAgentUsages";
import { DshProblemNote, DshQuotaRing } from "./DshQuotaRing";
import { QuotaRings } from "./QuotaRings";
import { WorkbuddyQuotaRing } from "./WorkbuddyQuotaRing";
import { QUOTA_COLORS } from "./quotaColors";
import "./AgentQuotaRings.css";

export { QUOTA_COLORS } from "./quotaColors";

/**
 * The Agent page's top row: Claude's, then Codex's quota rings, the 5-hour window outside and the
 * 7-day one inside. Like Codex's own usage page they show what is left: a full ring is a window
 * not touched yet, and the percentages beside them are the share left. DSH and WorkBuddy
 * follow with their balances. The island passes the filtered usage and sizes the page for it.
 */
export function AgentQuotaRings({ usages: given }: { usages?: AgentUsages }) {
  const own = useAgentUsages(given === undefined);
  const usages = given ?? own;
  const agents: [AgentProvider, AgentUsage | null][] = [["claudeCode", usages.claude], ["codex", usages.codex]];
  const shown = agents.filter((entry): entry is [AgentProvider, AgentUsage] => quotaRings(entry[1]) !== null);
  if (usageLineCount(usages) === 0) return null;
  return (
    <div className="agent-quota">
      {shown.map(([provider, usage]) => <AgentQuota key={provider} provider={provider} usage={usage} now={usages.readAt} />)}
      {usages.dsh ? <DshQuotaRing usage={usages.dsh} now={usages.readAt} /> : usages.dshProblem && <DshProblemNote problem={usages.dshProblem} />}
      {usages.workbuddy && <WorkbuddyQuotaRing usage={usages.workbuddy} now={Math.max(usages.readAt, usages.workbuddy.updatedAt)} />}
    </div>
  );
}

function AgentQuota({ provider, usage, now }: { provider: AgentProvider; usage: AgentUsage; now: number }) {
  const text = useTranslation().agent.usage;
  const rings = quotaRings(usage);
  if (!rings) return null;
  const label = provider === "codex" ? text.codexLabel : text.label;
  const stale = isStale(usage, now);
  const ringWindows = [rings.outer, rings.inner].flatMap((window) => (window ? [windowSummary(windowLabel(usage, window, text), window, now, text)] : []));
  const lines: HoverCardLine[] = [
    { text: label, color: QUOTA_COLORS[provider] },
    ...quotaSummaries(usage, now, text).map((summary) => ({ text: summary })),
    { text: text.ringsLegend, muted: true },
    ...(stale ? [{ text: text.stale, muted: true }] : []),
    ...usageSourceLines(usage, now, text),
  ];
  // ":scope" puts the card right under these rings rather than under the island.
  return (
    <IslandHoverCard lines={lines} alignTo=":scope" anchorClassName="agent-quota__hover">
      <QuotaRingPair
        provider={provider}
        outer={rings.outer ? percentLeft(rings.outer) : null}
        inner={rings.inner ? percentLeft(rings.inner) : null}
        stale={stale}
        label={text.rings(label, ringWindows)}
      />
    </IslandHoverCard>
  );
}

/**
 * One agent's rings and percentages, in its colour. `label` makes it an image with that
 * accessible name, focusable so the keyboard reaches its card; without one (a preview) it is hidden.
 */
export function QuotaRingPair({
  provider,
  outer,
  inner,
  size = 22,
  stale = false,
  label,
}: {
  provider: AgentProvider;
  /** Percent left of the 5-hour window (outer ring) and the 7-day one (inner); null: not known. */
  outer: number | null;
  inner: number | null;
  size?: number;
  stale?: boolean;
  label?: string;
}) {
  const percent = (left: number | null) => (left === null ? "–" : `${Math.round(left)}%`);
  return (
    <span
      className={`agent-quota__agent agent-quota__agent--${provider}${stale ? " agent-quota__agent--stale" : ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      tabIndex={label ? 0 : undefined}
    >
      <QuotaRings outer={outer} inner={inner} size={size} />
      <span className="agent-quota__values" aria-hidden="true">
        <b>{percent(outer)}</b>
        <span>{percent(inner)}</span>
      </span>
    </span>
  );
}

export { QuotaRings } from "./QuotaRings";
