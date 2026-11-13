import { IslandHoverCard } from "../../components/IslandHoverCard";
import { useTranslation } from "../../i18n";
import type { DshUsage } from "./api";
import { QuotaRings } from "./QuotaRings";
import { QUOTA_COLORS } from "./quotaColors";
import { dshBalanceLabel, dshBalanceRings } from "./dshUsage";
import { isStale } from "./usage";

/** DSH's prepaid wallets use the same ring shape, with availability rather than a fabricated %. */
export function DshQuotaRing({ usage, now }: { usage: DshUsage; now: number }) {
  const text = useTranslation().agent.usage;
  if (usage.wallets.length === 0) return null;
  const rings = dshBalanceRings(usage);
  const summaries = usage.wallets.map((wallet) => text.dshWallet(wallet.currency, wallet.total, wallet.toppedUp, wallet.granted));
  const stale = isStale(usage, now);
  const availability = usage.available ? text.dshAvailable : text.dshEmpty;
  const source = usage.source === "dshApi" ? text.fromDshApi : text.fromDshAccount;
  const lines = [
    { text: text.dshLabel, color: QUOTA_COLORS.dsh },
    ...usage.wallets.flatMap((wallet) => [
      { text: text.dshWalletTotal(wallet.currency, wallet.total) },
      { text: text.dshWalletParts(wallet.toppedUp, wallet.granted), muted: true },
    ]),
    { text: availability },
    ...text.dshLegend.map((legend) => ({ text: legend, muted: true })),
    ...(stale ? [{ text: text.stale, muted: true }] : []),
    { text: text.updated(text.updatedAgo(Math.max(0, Math.floor((now - usage.updatedAt) / 60_000))), "DSH"), muted: true },
    { text: source, muted: true },
  ];
  return (
    <IslandHoverCard lines={lines} alignTo=":scope" anchorClassName="agent-quota__hover">
      <span className={`agent-quota__agent agent-quota__agent--dsh${stale ? " agent-quota__agent--stale" : ""}`} role="img" aria-label={[text.dshLabel, ...summaries, availability, ...text.dshLegend].join(" · ")} tabIndex={0}>
        <QuotaRings {...rings} size={22} />
        <span className="agent-quota__values" aria-hidden="true"><b>{dshBalanceLabel(usage)}</b></span>
      </span>
    </IslandHoverCard>
  );
}
