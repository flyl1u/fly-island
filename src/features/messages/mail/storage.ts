import { normalizeMailAccounts, type MailAccountSettings } from "./mailAccounts.ts";

export const SETTINGS_KEY = "focusd-island-qq-mail-settings";

/** Saved mailboxes; the single-account format of older versions is read too. */
export function loadMailAccounts(): MailAccountSettings[] {
  try {
    return normalizeMailAccounts(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null"));
  } catch { return []; }
}

export function saveMailAccounts(accounts: MailAccountSettings[]) {
  if (accounts.length === 0) {
    localStorage.removeItem(SETTINGS_KEY);
    return;
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    accounts: accounts.map(({ email, host, enabled }) => ({ email, host, enabled })),
  }));
}
