import { useTranslation } from "../../i18n";
import type { BalanceResult } from "./types";

export function BalanceResultView({ result }: { result: BalanceResult }) {
  const t = useTranslation().settings.plugins.balance;
  const amount = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return <div className="api-balance-result">
    {result.planName && <p>{result.planName}</p>}
    {result.data.map((row, i) => <div key={i} className="api-balance-result__wallet">
      {row.planName && <span>{row.planName}</span>}
      {row.isValid === false && <span className="api-balance-error">{t.invalid}</span>}
      {row.unlimited ? <strong>{t.unlimited}</strong> : row.remaining != null && <span>{t.remaining} <strong>{amount(row.remaining)}</strong> {row.unit}</span>}
      {row.used != null && <span>{t.used} {amount(row.used)} {row.unit}</span>}
      {row.total != null && <span>{t.total} {amount(row.total)} {row.unit}</span>}
    </div>)}
    {result.tiers.map((tier, i) => <div className="api-balance-result__tier" key={`${tier.name}-${i}`}>
      <div className="api-balance-result__line"><span>{t.windows[tier.name] ?? tier.name}</span><span>{t.used} {amount(tier.utilization)}%</span></div>
      <progress max={100} value={Math.max(0, Math.min(100, tier.utilization))} aria-label={`${t.windows[tier.name] ?? tier.name}: ${tier.utilization}%`} />
      {tier.usedValueUsd != null && tier.maxValueUsd != null && <small>{amount(tier.usedValueUsd)} / {amount(tier.maxValueUsd)} USD</small>}
      {tier.resetsAt && <small>{t.reset} {Number.isNaN(Date.parse(tier.resetsAt)) ? tier.resetsAt : new Date(tier.resetsAt).toLocaleString()}</small>}
    </div>)}
  </div>;
}
