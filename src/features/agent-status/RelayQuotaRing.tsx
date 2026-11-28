import { IslandHoverCard, type HoverCardLine } from "../../components/IslandHoverCard";
import { useLocale, useTranslation } from "../../i18n";
import type { RelayBalance, RelayUsage } from "./api";
import { QuotaRings } from "./QuotaRings";
import { QUOTA_COLORS } from "./quotaColors";

/** One ring per configured relay account; the headline value is money, never a percentage. */
export function RelayQuotaRings({ usage, now }: { usage: RelayUsage; now: number }) {
  return <>{usage.accounts.map((account) => (
    <RelayQuotaRing key={account.id} account={account} now={now} updatedAt={usage.updatedAt} />
  ))}</>;
}

function RelayQuotaRing({ account, now, updatedAt }: { account: RelayBalance; now: number; updatedAt: number }) {
  const text = useTranslation().agent.usage;
  const relay = text.relay;
  const { locale } = useLocale();
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const money = (value: number) => `${account.currency} ${format.format(value)}`;
  const left = !account.unlimited && account.remaining !== null && account.total !== null && account.total > 0
    ? Math.min(100, Math.max(0, 100 * account.remaining / account.total))
    : null;
  const minutes = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  const problem = account.problem ? relay.problem[account.problem as keyof typeof relay.problem] ?? relay.problem.format : null;
  const headline = problem ? problem.short : account.unlimited ? relay.unlimited : account.remaining === null ? "–" : money(account.remaining);
  const lines: HoverCardLine[] = [
    { text: relay.label(account.name, account.adapter), color: QUOTA_COLORS.relay },
    ...(problem ? [{ text: problem.detail }] : [
      ...(account.remaining === null ? [] : [{ text: relay.balance(money(account.remaining), account.total === null ? null : money(account.total)) }]),
      ...(account.used === null ? [] : [{ text: relay.used(money(account.used)) }]),
      ...(left === null ? [] : [{ text: relay.percent(Math.round(left)) }]),
      ...(account.todaySpend === null ? [] : [{ text: relay.spend(relay.today, money(account.todaySpend)) }]),
      ...(account.weekSpend === null ? [] : [{ text: relay.spend(relay.week, money(account.weekSpend)) }]),
      ...(account.monthSpend === null ? [] : [{ text: relay.spend(relay.month, money(account.monthSpend)) }]),
      ...(account.allTimeSpend === null ? [] : [{ text: relay.spend(relay.allTime, money(account.allTimeSpend)) }]),
    ]),
    { text: text.updated(text.updatedAgo(minutes), relay.source), muted: true },
  ];
  return (
    <IslandHoverCard lines={lines} delayMs={0} alignTo=":scope" anchorClassName="agent-quota__hover">
      <span className={`agent-quota__agent agent-quota__agent--relay${problem ? " agent-quota__agent--problem" : ""}`}
        role="img" aria-label={lines.map((line) => line.text).join(" · ")} tabIndex={0}>
        <QuotaRings outer={left} inner={left} />
        <span className="agent-quota__values" aria-hidden="true"><b>{headline}</b></span>
      </span>
    </IslandHoverCard>
  );
}
