import { useTranslation } from "../../i18n";
import { IslandHoverCard, type HoverCardLine } from "../../components/IslandHoverCard";
import type { AgentProvider, AgentUsage } from "./api";
import { isStale, quotaRings, quotaSummaries, usageSourceLines, windowLabel, windowSummary, type AgentUsages } from "./usage";
import { useAgentUsages } from "./useAgentUsages";
import "./AgentQuotaRings.css";

/** Each agent's ring colour, for the dot on its card: Claude's clay, Codex's blue. */
export const QUOTA_COLORS: Record<AgentProvider, string> = { claudeCode: "#e5a385", codex: "#6ea8fe" };

/**
 * The Agent page's top row: Claude's, then Codex's quota rings, the 5-hour window outside and the
 * 7-day one inside, filled by the share used, with the two percentages beside them. Resting on or
 * focusing an agent's rings shows every window with its reset time. An agent without numbers has
 * no rings; with neither, there is no row. `usages` comes from the island, which sizes the page
 * for the row; without it the rings read their own.
 */
export function AgentQuotaRings({ usages: given }: { usages?: AgentUsages }) {
  const own = useAgentUsages(given === undefined);
  const usages = given ?? own;
  const agents: [AgentProvider, AgentUsage | null][] = [["claudeCode", usages.claude], ["codex", usages.codex]];
  const shown = agents.filter((entry): entry is [AgentProvider, AgentUsage] => quotaRings(entry[1]) !== null);
  if (shown.length === 0) return null;
  return (
    <div className="agent-quota">
      {shown.map(([provider, usage]) => <AgentQuota key={provider} provider={provider} usage={usage} now={usages.readAt} />)}
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
        outer={rings.outer?.used ?? null}
        inner={rings.inner?.used ?? null}
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
  /** Percent used of the 5-hour window (outer ring) and the 7-day one (inner); null: not known. */
  outer: number | null;
  inner: number | null;
  size?: number;
  stale?: boolean;
  label?: string;
}) {
  const percent = (used: number | null) => (used === null ? "–" : `${Math.round(used)}%`);
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

/** Two concentric rings in the current `--quota-color`, drawn on a 24-unit grid so they stay crisp from 14 to 28 px. */
export function QuotaRings({ outer, inner, size = 22 }: { outer: number | null; inner: number | null; size?: number }) {
  return (
    <svg className="quota-rings" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <Ring radius={10} used={outer} />
      <Ring radius={5.5} used={inner} />
    </svg>
  );
}

function Ring({ radius, used }: { radius: number; used: number | null }) {
  // A sliver still shows that something is used; a full ring is drawn whole.
  const shown = used === null || used <= 0 ? 0 : Math.min(100, Math.max(used, 3));
  return (
    <>
      <circle className="quota-rings__track" cx={12} cy={12} r={radius} />
      {shown > 0 && (
        <circle
          className="quota-rings__fill"
          cx={12}
          cy={12}
          r={radius}
          pathLength={100}
          strokeDasharray={shown >= 100 ? undefined : `${shown} 100`}
          transform="rotate(-90 12 12)"
        />
      )}
    </>
  );
}
