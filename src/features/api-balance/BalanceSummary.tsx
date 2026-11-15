import { Wallet } from "lucide-react";
import { IslandHoverCard } from "../../components/IslandHoverCard";
import { useTranslation } from "../../i18n";
import type { BalanceDisplay } from "./balanceDisplay";
import "./BalanceSummary.css";

export function BalanceSummary({ accounts }: { accounts: readonly BalanceDisplay[] }) {
  const t = useTranslation().settings.plugins.balance;
  const first = accounts[0];
  if (!first) return null;
  const text = (row: BalanceDisplay) => `${row.name} · ${row.amount}${row.low ? ` · ${t.alertTitle}` : ""}${row.stale ? ` · ${t.stale}` : ""}`;
  return <IslandHoverCard alignTo=":scope" anchorClassName="balance-summary-anchor" lines={accounts.map(row => ({ text: text(row), muted: row.stale }))}>
    <span className={`balance-summary${first.low ? " balance-summary--low" : ""}${first.stale ? " balance-summary--stale" : ""}`} tabIndex={0} role="img" aria-label={accounts.map(text).join("; ")}>
      <Wallet size={13} aria-hidden="true" />
      <span className="balance-summary__name">{first.name}</span>
      <strong className="balance-summary__amount">{first.amount}</strong>
      {accounts.length > 1 && <small>+{accounts.length - 1}</small>}
    </span>
  </IslandHoverCard>;
}
