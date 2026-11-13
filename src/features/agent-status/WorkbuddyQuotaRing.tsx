import { IslandHoverCard } from "../../components/IslandHoverCard";
import { useLocale, useTranslation } from "../../i18n";
import type { WorkbuddyUsage } from "./api";
import { QuotaRings } from "./QuotaRings";

export function WorkbuddyQuotaRing({ usage, now }: { usage: WorkbuddyUsage; now: number }) {
  const text = useTranslation().agent.usage;
  const { locale } = useLocale();
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });
  const remaining = format.format(usage.remaining);
  const total = format.format(usage.total);
  const left = usage.total > 0 ? Math.min(100, 100 * (usage.remaining / usage.total)) : null;
  const minutes = Math.max(0, Math.floor((now - usage.updatedAt) / 60_000));
  const details = [text.workbuddy.balance(remaining, total), ...(left === null ? [] : [text.workbuddy.percent(Math.round(left))])];
  const updated = text.updated(text.updatedAgo(minutes), text.workbuddy.source);
  return (
    <IslandHoverCard alignTo=":scope" anchorClassName="agent-quota__hover" lines={[
      { text: text.workbuddy.label, color: "#c8a7ff" },
      ...details.map((line) => ({ text: line })),
      { text: updated, muted: true },
    ]}>
      <span className="agent-quota__agent agent-quota__agent--workbuddy" role="img"
        aria-label={[text.workbuddy.label, ...details, updated].join(" · ")} tabIndex={0}>
        <QuotaRings outer={left} single />
        <span className="agent-quota__values" aria-hidden="true"><b>{text.workbuddy.credits(remaining)}</b></span>
      </span>
    </IslandHoverCard>
  );
}
