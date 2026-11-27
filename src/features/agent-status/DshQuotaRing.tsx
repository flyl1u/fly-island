import { IslandHoverCard } from "../../components/IslandHoverCard";
import { useTranslation } from "../../i18n";
import type { DshProblem, DshUsage } from "./api";
import { QuotaRings } from "./QuotaRings";
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
  const balance = usage.wallets.length === 1 ? dshBalanceLabel(usage)
    : usage.wallets.map((wallet) => `${wallet.currency} ${Number(wallet.total).toFixed(2)}`).join(" · ");
  const hint = text.balanceHint(balance);
  return (
      <span className={`agent-quota__agent agent-quota__agent--dsh${stale ? " agent-quota__agent--stale" : ""}`} role="group" aria-label={[text.dshLabel, ...summaries, availability, ...text.dshLegend].join(" · ")}>
        <QuotaRings {...rings} provider="dsh" hints={[hint, hint]} />
      </span>
  );
}

/** In place of the ring when DSH is set up but its balance cannot be read: say why, briefly. */
export function DshProblemNote({ problem }: { problem: DshProblem }) {
  const text = useTranslation().agent.usage;
  const reason = text.dshProblem[problem];
  return (
    <IslandHoverCard lines={[{ text: reason.short }]} placement="right" compact alignTo=":scope" anchorClassName="agent-quota__hover">
      <span className="agent-quota__agent agent-quota__agent--dsh agent-quota__agent--problem" role="img" aria-label={`${text.dshLabel} · ${reason.detail}`} tabIndex={0}>
        <QuotaRings outer={null} inner={null} provider="dsh" />
      </span>
    </IslandHoverCard>
  );
}
