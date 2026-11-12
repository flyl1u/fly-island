import type { DshUsage } from "./api";

/** Currency wallets remain separate: a dollar is never added to a yuan. */
export function primaryDshWallet(usage: DshUsage) {
  return usage.wallets.find((wallet) => Number(wallet.total) > 0) ?? usage.wallets[0] ?? null;
}

export function dshBalanceLabel(usage: DshUsage) {
  const wallet = primaryDshWallet(usage);
  if (!wallet) return "";
  const amount = Number(wallet.total);
  const symbol = wallet.currency === "CNY" ? "¥" : "$";
  return `${symbol}${amount.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 2 })}`;
}

/** Filled means usable, empty means exhausted. A prepaid balance has no percent denominator. */
export function dshBalanceRings(usage: DshUsage) {
  return {
    outer: usage.available ? 100 : 0,
    inner: usage.wallets.some((wallet) => Number(wallet.granted) > 0) ? 100 : 0,
  };
}
