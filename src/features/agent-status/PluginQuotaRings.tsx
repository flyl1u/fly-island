import type { PluginQuota } from "../plugins";
import { QuotaRings } from "./QuotaRings";
import { useTranslation } from "../../i18n";

export function PluginQuotaRings({ items }: { items: PluginQuota[] }) {
  const t = useTranslation().agent.usage;
  return <>{items.map((q) => {
    const hint = (value: number | null, window: string) => q.balance ? t.balanceHint(q.balance) : value === null ? t.ringUnknown(window) : t.ringHint(window, Math.round(value));
    return <span key={q.id} className="agent-quota__agent agent-quota__agent--plugin" role="group" aria-label={[q.label, q.balance, q.remainingPercent === null ? null : `${Math.round(q.remainingPercent)}%`].filter(Boolean).join(" · ")}>
        <QuotaRings outer={q.remainingPercent} inner={q.secondaryPercent} provider="plugin" hints={[hint(q.remainingPercent, q.label), hint(q.secondaryPercent, q.label)]} />
      </span>;
  })}</>;
}
