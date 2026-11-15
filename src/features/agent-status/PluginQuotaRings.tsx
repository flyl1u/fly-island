import { IslandHoverCard } from "../../components/IslandHoverCard";
import type { PluginQuota } from "../plugins";
import { QuotaRings } from "./QuotaRings";
import { useLocale, useTranslation } from "../../i18n";

export function PluginQuotaRings({ items }: { items: PluginQuota[] }) {
  const { locale } = useLocale();
  const t = useTranslation().agent.usage;
  return <>{items.map((q) => {
    const reset = q.resetsAt !== null && q.resetsAt > Date.now() ? new Date(q.resetsAt).toLocaleString(locale) : null;
    const lines = [{ text: q.label }, ...(q.balance ? [{ text: q.balance }] : []), ...(reset ? [{ text: reset, muted: true }] : []), { text: t.ringsLegend, muted: true }];
    return <IslandHoverCard key={q.id} lines={lines} alignTo=":scope" anchorClassName="agent-quota__hover">
      <span className="agent-quota__agent agent-quota__agent--plugin" role="img" aria-label={[q.label, q.balance, q.remainingPercent === null ? null : `${Math.round(q.remainingPercent)}%`].filter(Boolean).join(" · ")} tabIndex={0}>
        <QuotaRings outer={q.remainingPercent} inner={q.secondaryPercent} />
        <span className="agent-quota__values" aria-hidden="true"><b>{q.balance ?? (q.remainingPercent === null ? "–" : `${Math.round(q.remainingPercent)}%`)}</b><span>{q.secondaryPercent === null ? q.label : `${Math.round(q.secondaryPercent)}%`}</span></span>
      </span>
    </IslandHoverCard>;
  })}</>;
}
