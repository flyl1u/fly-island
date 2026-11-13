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

/**
 * Filled means usable, empty means exhausted. A prepaid balance has no percent denominator. Both
 * rings show it (2026-11-13): an inner ring for bonus balance alone was empty for most accounts,
 * so DSH looked a ring short beside the others; the bonus is in the hover card.
 */
export function dshBalanceRings(usage: DshUsage) {
  const left = usage.available ? 100 : 0;
  return { outer: left, inner: left };
}
