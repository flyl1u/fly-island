import type { BalanceSnapshot } from "./types";

export interface BalanceDisplay { id: string; name: string; amount: string; low: boolean; stale: boolean }
export const balanceAmount = (value: number): string => value.toLocaleString(undefined, { maximumFractionDigits: 4 });

/** Each wallet retains its own unit. Accounts are never added together. */
export function balanceDisplays(snapshot: BalanceSnapshot): BalanceDisplay[] {
  if (!snapshot.enabled) return [];
  return snapshot.accounts.filter(row => row.account.enabled && row.result).map(row => {
    const values = row.result!.data.flatMap(d => d.isValid === false ? [] : d.unlimited ? ["∞"]
      : d.remaining != null && Number.isFinite(d.remaining) ? [`${balanceAmount(d.remaining)}${d.unit ? ` ${d.unit}` : ""}`] : []);
    if (!values.length) values.push(...row.result!.tiers.map(t => `${t.name} ${balanceAmount(Math.max(0, 100 - t.utilization))}%`));
    return { id: row.account.id, name: row.account.name, amount: values.join(" / ") || "—", low: Boolean(row.warning), stale: Boolean(row.error) };
  }).sort((a, b) => Number(b.low) - Number(a.low));
}

/** Consume each native alert once in the persistent island window, including duplicate snapshots. */
export function takeBalanceAlerts(seen: Map<string, number>, snapshot: BalanceSnapshot) {
  const ids = new Set(snapshot.accounts.map(row => row.account.id));
  for (const id of seen.keys()) if (!ids.has(id)) seen.delete(id);
  if (!snapshot.enabled) return [];
  return snapshot.accounts.flatMap(row => {
    const warning = row.warning;
    if (!row.account.enabled || !warning || row.error || seen.get(row.account.id) === warning.triggeredAt) return [];
    seen.set(row.account.id, warning.triggeredAt);
    return [{ name: row.account.name, ...warning }];
  });
}
