import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { BalanceAccount, BalanceResult, BalanceSecrets, BalanceSnapshot, ImportEntry } from "./types";

export const BALANCE_CHANGED = "api-balance-changed";
export const getBalanceState = () => invoke<BalanceSnapshot>("get_api_balance_state");
export const enableBalance = (enabled: boolean) => invoke<BalanceSnapshot>("set_api_balance_enabled", { enabled });
export const saveBalanceAccount = (account: BalanceAccount, secrets: BalanceSecrets) => invoke<BalanceSnapshot>("save_api_balance_account", { account, secrets });
export const removeBalanceAccount = (id: string) => invoke<BalanceSnapshot>("remove_api_balance_account", { id });
export const readBalanceScript = (id: string) => invoke<string>("read_api_balance_script", { id });
export const importBalanceAccounts = (entries: ImportEntry[]) => invoke<BalanceSnapshot>("import_api_balance_accounts", { entries });
export const refreshBalance = (id: string) => invoke<BalanceSnapshot>("refresh_api_balance", { id });
export const testBalance = (account: BalanceAccount, secrets: BalanceSecrets) => invoke<BalanceResult>("test_api_balance", { account, secrets });
export const onBalanceChanged = (callback: (state: BalanceSnapshot) => void) => listen<BalanceSnapshot>(BALANCE_CHANGED, ({ payload }) => callback(payload));
