import { useTranslation } from "../../i18n";
import type { AgentProvider, AgentUsage } from "./api";
import { isStale, percentLeft, quotaRings, usageLineCount, windowLabel, windowSummary, type AgentUsages } from "./usage";
import { useAgentUsages } from "./useAgentUsages";
import { DshProblemNote, DshQuotaRing } from "./DshQuotaRing";
import { QuotaRings } from "./QuotaRings";
import { WorkbuddyQuotaRing } from "./WorkbuddyQuotaRing";
import { AGENT_PROVIDER_LABELS } from "./status";
import "./AgentQuotaRings.css";
import { PluginQuotaRings } from "./PluginQuotaRings";

export { QUOTA_COLORS } from "./quotaColors";

/**
 * The quota row: each app has a short-window arc above its logo and a weekly arc below.
 * Balances reuse the shape without inventing a percentage denominator.
 */
export function AgentQuotaRings({ usages: given }: { usages?: AgentUsages }) {
  const own = useAgentUsages(given === undefined);
  const usages = given ?? own;
  const agents: [AgentProvider, AgentUsage | null][] = [["claudeCode", usages.claude], ["codex", usages.codex], ["kimiCode", usages.kimi ?? null], ["zcode", usages.zcode ?? null], ["antigravity", usages.antigravity ?? null]];
  const shown = agents.filter((entry): entry is [AgentProvider, AgentUsage] => quotaRings(entry[1]) !== null);
  if (usageLineCount(usages) === 0) return null;
  return (
    <div className="agent-quota">
      {shown.map(([provider, usage]) => <AgentQuota key={provider} provider={provider} usage={usage} now={usages.readAt} />)}
      {usages.dsh ? <DshQuotaRing usage={usages.dsh} now={usages.readAt} /> : usages.dshProblem && <DshProblemNote problem={usages.dshProblem} />}
      {usages.workbuddy && <WorkbuddyQuotaRing usage={usages.workbuddy} now={Math.max(usages.readAt, usages.workbuddy.updatedAt)} />}
      <PluginQuotaRings items={usages.plugins ?? []} />
    </div>
  );
}

function AgentQuota({ provider, usage, now }: { provider: AgentProvider; usage: AgentUsage; now: number }) {
  const text = useTranslation().agent.usage;
  const rings = quotaRings(usage);
  if (!rings) return null;
  const label = provider === "claudeCode" ? text.label : provider === "codex" ? text.codexLabel : AGENT_PROVIDER_LABELS[provider];
  const stale = isStale(usage, now);
  const ringWindows = [rings.outer, rings.inner].flatMap((window) => (window ? [windowSummary(windowLabel(usage, window, text), window, now, text)] : []));
  const hint = (window: typeof rings.outer, fallback: string) => window
    ? text.ringHint(window === usage.sevenDay ? text.weekly : windowLabel(usage, window, text), percentLeft(window)) : text.ringUnknown(fallback);
  return (
      <QuotaRingPair
        provider={provider}
        outer={rings.outer ? percentLeft(rings.outer) : null}
        inner={rings.inner ? percentLeft(rings.inner) : null}
        stale={stale}
        label={text.rings(label, ringWindows)}
        hints={[hint(rings.outer, text.fiveHour), hint(rings.inner, text.weekly)]}
      />
  );
}

/**
 * One agent's arcs and logo, in its colour. Each half is a keyboard-accessible hover target.
 */
export function QuotaRingPair({
  provider,
  outer,
  inner,
  size = 24,
  stale = false,
  label,
  hints,
}: {
  provider: AgentProvider;
  /** Percent left of the upper and lower windows; null means unknown. */
  outer: number | null;
  inner: number | null;
  size?: number;
  stale?: boolean;
  label?: string;
  hints?: readonly [string, string];
}) {
  return (
    <span
      className={`agent-quota__agent agent-quota__agent--${provider}${stale ? " agent-quota__agent--stale" : ""}`}
      role={label ? "group" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <QuotaRings outer={outer} inner={inner} size={size} provider={provider} hints={hints} />
    </span>
  );
}

export { QuotaRings } from "./QuotaRings";
