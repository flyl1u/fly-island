import { writeJson } from "../../lib/storage";
import type { BalanceSnapshot } from "./types";

export const BALANCE_METADATA_KEY = "focusd-island-api-balance";
// A non-secret UI mirror; Rust's app-data file owns startup/background scheduling.
export function cacheBalanceMetadata(state: BalanceSnapshot): void {
  writeJson(BALANCE_METADATA_KEY, { enabled: state.enabled, accounts: state.accounts.map(row => row.account) });
}
