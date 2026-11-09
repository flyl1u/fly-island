import type { MailSnapshot } from "./api";

/** One saved mailbox. `host` is the IMAP server the user typed; empty means imap.<domain>. */
export type MailAccountSettings = { email: string; host: string; enabled: boolean };

/** Up to this many accounts are kept, matching MAX_ACCOUNTS in mail/accounts.rs. */
export const MAX_MAIL_ACCOUNTS = 5;

function account(value: unknown): MailAccountSettings | null {
  if (!value || typeof value !== "object") return null;
  const { email, host, enabled } = value as Record<string, unknown>;
  if (typeof email !== "string" || !email.trim() || typeof enabled !== "boolean") return null;
  return { email: email.trim().toLowerCase(), host: typeof host === "string" ? host.trim() : "", enabled };
}

/**
 * Reads `focusd-island-qq-mail-settings`: `{ accounts: [...] }`, or the single
 * `{ email, enabled }` that versions before multi-account saved.
 */
export function normalizeMailAccounts(stored: unknown): MailAccountSettings[] {
  if (!stored || typeof stored !== "object") return [];
  const list = (stored as { accounts?: unknown }).accounts;
  const candidates = Array.isArray(list) ? list : [stored];
  const seen = new Set<string>();
  const accounts: MailAccountSettings[] = [];
  for (const candidate of candidates) {
    const next = account(candidate);
    if (!next || seen.has(next.email)) continue;
    seen.add(next.email);
    accounts.push(next);
    if (accounts.length === MAX_MAIL_ACCOUNTS) break;
  }
  return accounts;
}

/** The backend publishes this for a mailbox it has forgotten. */
export function isRemovedMailbox(snapshot: MailSnapshot) {
  return !snapshot.configured && snapshot.status === "disconnected";
}

/** Replaces the mailbox's snapshot in place, appends a new one, or drops a removed one. */
export function upsertMailbox(snapshots: MailSnapshot[], next: MailSnapshot): MailSnapshot[] {
  if (!next.email) return snapshots;
  const index = snapshots.findIndex((snapshot) => snapshot.email === next.email);
  if (isRemovedMailbox(next)) return index < 0 ? snapshots : snapshots.filter((_, i) => i !== index);
  if (index < 0) return [...snapshots, next];
  return snapshots.map((snapshot, i) => (i === index ? next : snapshot));
}

/** Snapshots in the order the accounts were saved; unsaved ones keep their order at the end. */
export function orderMailboxes(snapshots: MailSnapshot[], saved: MailAccountSettings[]): MailSnapshot[] {
  const rank = (email: string | null) => {
    const index = saved.findIndex((entry) => entry.email === email);
    return index < 0 ? saved.length : index;
  };
  return snapshots
    .map((snapshot, index) => ({ snapshot, index }))
    .sort((a, b) => rank(a.snapshot.email) - rank(b.snapshot.email) || a.index - b.index)
    .map(({ snapshot }) => snapshot);
}

/**
 * The saved list after a snapshot: connected mailboxes are kept, forgotten ones dropped.
 * `typedHost` is the server this window's connect form sent; it wins over the saved one,
 * because the island and the settings window both save and either may save first.
 */
export function rememberMailbox(saved: MailAccountSettings[], next: MailSnapshot, typedHost = ""): MailAccountSettings[] {
  if (!next.email) return saved;
  const others = saved.filter((entry) => entry.email !== next.email);
  if (isRemovedMailbox(next)) return others;
  if (!next.configured) return saved;
  const index = saved.findIndex((entry) => entry.email === next.email);
  const host = typedHost.trim() || (index < 0 ? "" : saved[index].host);
  const entry = { email: next.email, host, enabled: next.enabled };
  return index < 0 ? [...saved, entry] : saved.map((old, i) => (i === index ? entry : old));
}

/** Unread mail across the mailboxes that are receiving. */
export function totalUnread(snapshots: MailSnapshot[]) {
  return snapshots.reduce((sum, snapshot) => sum + (snapshot.enabled ? snapshot.unreadCount ?? 0 : 0), 0);
}
