import { useTranslation } from "../../../i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getQQMailState, invokeQQMailCommand, listenQQMailChanged, type MailEvent, type MailSnapshot, type QQMailCommand } from "./api";
import { loadMailAccounts, saveMailAccounts } from "./storage";
import { orderMailboxes, rememberMailbox, totalUnread, upsertMailbox } from "./mailAccounts";

/**
 * Every mailbox the backend knows and the commands that change one. Both the island
 * and the settings window use it; each keeps its own copy in step through the
 * qq-mail-changed event. `restore` reconnects the saved mailboxes at startup, which
 * only the island does, since it is always running.
 */
export function useMailAccounts({ restore, onSnapshot, onEvent }: {
  restore: boolean;
  /** Called for each snapshot accepted, before it is shown. */
  onSnapshot?: (snapshot: MailSnapshot) => void;
  /** Called for each event whose snapshot was accepted. */
  onEvent?: (event: MailEvent) => void;
}) {
  const t = useTranslation();
  const translationsRef = useRef(t);
  translationsRef.current = t;
  const [mailboxes, setMailboxes] = useState<MailSnapshot[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(isTauri);
  const revisionsRef = useRef(new Map<string, number>());
  const typedHostsRef = useRef(new Map<string, string>());
  const actionIdRef = useRef(0);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const acceptSnapshot = useCallback((next: MailSnapshot, persist = true) => {
    const email = next.email;
    if (!email || next.revision < (revisionsRef.current.get(email) ?? -1)) return false;
    revisionsRef.current.set(email, next.revision);
    onSnapshotRef.current?.(next);
    setMailboxes((current) => upsertMailbox(current, next));
    if (next.status === "connected" && !next.syncing) setActionError(null);
    if (persist) {
      // Read again first: the other window may have saved since this one last did.
      try { saveMailAccounts(rememberMailbox(loadMailAccounts(), next, typedHostsRef.current.get(email))); }
      catch { setActionError(translationsRef.current.mail.savePreferencesFailed); }
    }
    return true;
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenQQMailChanged(({ payload }) => {
        if (!cancelled && acceptSnapshot(payload.snapshot)) onEventRef.current?.(payload);
      });
      if (cancelled) { unlisten(); return; }
      const saved = loadMailAccounts();
      const current = await getQQMailState();
      if (cancelled) return;
      for (const snapshot of orderMailboxes(current, saved)) acceptSnapshot(snapshot, false);
      if (!restore) return;
      for (const account of saved) {
        if (current.some((snapshot) => snapshot.email === account.email)) continue;
        try {
          const restored = await invokeQQMailCommand("set_qq_mail_enabled", { email: account.email, enabled: account.enabled, host: account.host || null });
          if (cancelled) return;
          acceptSnapshot(restored);
        } catch (error) { if (!cancelled) setActionError(String(error)); }
      }
    })().catch((error: unknown) => {
      if (!cancelled) setActionError(String(error));
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; unlisten?.(); };
  }, [acceptSnapshot, restore]);

  const run = useCallback(async (command: QQMailCommand, args: Record<string, unknown>) => {
    if (!isTauri()) { setActionError(t.mail.desktopConnect); return false; }
    const id = ++actionIdRef.current;
    setBusy(true);
    setActionError(null);
    try {
      const next = await invokeQQMailCommand(command, args);
      return id === actionIdRef.current && acceptSnapshot(next);
    } catch (error) {
      if (id === actionIdRef.current) setActionError(String(error));
      return false;
    } finally { if (id === actionIdRef.current) setBusy(false); }
  }, [acceptSnapshot, t]);

  const savedHost = (email: string | null) => loadMailAccounts().find((account) => account.email === email)?.host || null;

  /** Connects a new mailbox (with the server typed, if any) or re-enters a known one's code. */
  const connect = useCallback((email: string, authorizationCode: string, host?: string) => {
    const key = email.trim().toLowerCase();
    if (host?.trim()) typedHostsRef.current.set(key, host.trim());
    return run("connect_qq_mail", { email, authorizationCode, host: host?.trim() || savedHost(key) });
  }, [run]);
  const setEnabled = useCallback((email: string, enabled: boolean) =>
    run("set_qq_mail_enabled", { email, enabled, host: savedHost(email) }), [run]);
  /** The module switch: pause or resume every connected mailbox. */
  const setAllEnabled = useCallback(async (enabled: boolean) => {
    for (const mailbox of mailboxes) {
      if (mailbox.email && mailbox.configured && mailbox.enabled !== enabled) await setEnabled(mailbox.email, enabled);
    }
  }, [mailboxes, setEnabled]);
  const refresh = useCallback((email: string) => run("refresh_qq_mail", { email }), [run]);
  const disconnect = useCallback((email: string) => run("disconnect_qq_mail", { email }), [run]);
  const openHelp = useCallback(async () => {
    try { await openUrl("https://service.mail.qq.com/"); }
    catch { setActionError(t.mail.helpFailed); }
  }, [t]);

  return {
    mailboxes, busy, actionError, setActionError, connect, setEnabled, setAllEnabled, refresh, disconnect, openHelp,
    unreadTotal: totalUnread(mailboxes),
    anyConfigured: mailboxes.some((mailbox) => mailbox.configured),
    anyReceiving: mailboxes.some((mailbox) => mailbox.configured && mailbox.enabled),
  };
}

export type MailAccountsController = ReturnType<typeof useMailAccounts>;
