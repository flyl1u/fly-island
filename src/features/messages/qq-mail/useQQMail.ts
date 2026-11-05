import { useTranslation } from "../../../i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { nextQQPreview, type QQPreviewTiming } from "../qqNotificationTiming";
import { getQQMailState, invokeQQMailCommand, listenQQMailChanged, type MailMessage, type MailSnapshot, type QQMailCommand } from "./api";
import { loadMailAccounts, saveMailAccounts } from "./storage";
import { mailWebUrl } from "./mailDomain";
import { orderMailboxes, rememberMailbox, totalUnread, upsertMailbox, type MailAccountSettings } from "./mailAccounts";
import { useMailReader } from "./useMailReader";

const EMPTY_SNAPSHOT: MailSnapshot = {
  revision: 0, email: null, configured: false, enabled: false, syncing: false,
  status: "disconnected", unreadCount: null, items: [], lastSyncedAt: null, error: null,
};

type PreviewWindow = { email: string; id: string; receivedAt: number; expiresAt: number };

export function useQQMail(canPreview: boolean) {
  const t = useTranslation();
  const translationsRef = useRef(t);
  translationsRef.current = t;
  const [mailboxes, setMailboxes] = useState<MailSnapshot[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(isTauri);
  const [previewWindow, setPreviewWindow] = useState<PreviewWindow | null>(null);
  const previewRef = useRef<PreviewWindow | null>(null);
  const canPreviewRef = useRef(canPreview);
  const revisionsRef = useRef(new Map<string, number>());
  const savedRef = useRef<MailAccountSettings[]>([]);
  const typedHostsRef = useRef(new Map<string, string>());
  const timingRef = useRef<QQPreviewTiming | null>(null);
  const actionIdRef = useRef(0);

  const showPreview = useCallback((next: PreviewWindow | null) => {
    previewRef.current = next;
    setPreviewWindow(next);
  }, []);
  const clearPreview = useCallback(() => {
    timingRef.current = null;
    showPreview(null);
  }, [showPreview]);
  const reader = useMailReader(t, clearPreview, setActionError);
  const { closeReader, readerAccount, readMail: openInReader } = reader;
  const readerAccountRef = useRef(readerAccount);
  readerAccountRef.current = readerAccount;

  useLayoutEffect(() => {
    canPreviewRef.current = canPreview;
    if (!canPreview) clearPreview();
  }, [canPreview, clearPreview]);

  const acceptSnapshot = useCallback((next: MailSnapshot, persist = true) => {
    const email = next.email;
    if (!email || next.revision < (revisionsRef.current.get(email) ?? -1)) return false;
    revisionsRef.current.set(email, next.revision);
    if (previewRef.current?.email === email && (!next.enabled || next.status !== "connected")) clearPreview();
    if (readerAccountRef.current === email && (!next.configured || next.status === "authRequired")) closeReader();
    setMailboxes((current) => upsertMailbox(current, next));
    if (next.status === "connected" && !next.syncing) setActionError(null);
    if (persist) {
      savedRef.current = rememberMailbox(savedRef.current, next, typedHostsRef.current.get(email));
      try { saveMailAccounts(savedRef.current); }
      catch { setActionError(translationsRef.current.mail.savePreferencesFailed); }
    }
    return true;
  }, [clearPreview, closeReader]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    savedRef.current = loadMailAccounts();
    void (async () => {
      unlisten = await listenQQMailChanged(({ payload }) => {
        if (cancelled || !acceptSnapshot(payload.snapshot)) return;
        if (!canPreviewRef.current || !payload.windowVisible) { clearPreview(); return; }
        const { email, enabled, status } = payload.snapshot;
        if (payload.newestId && email && enabled && status === "connected") {
          const receivedAt = Date.now();
          const { timing, expiresAt } = nextQQPreview(timingRef.current, receivedAt);
          timingRef.current = timing;
          showPreview(expiresAt === null ? null : { email, id: payload.newestId, receivedAt, expiresAt });
        }
      });
      if (cancelled) { unlisten(); return; }
      const saved = savedRef.current;
      const current = await getQQMailState();
      if (cancelled) return;
      for (const snapshot of orderMailboxes(current, saved)) acceptSnapshot(snapshot, false);
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
  }, [acceptSnapshot, clearPreview, showPreview]);

  useEffect(() => {
    if (!previewWindow) return;
    const timer = window.setTimeout(() => showPreview(null), Math.max(0, previewWindow.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previewWindow, showPreview]);

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

  const current = adding ? null : mailboxes.find((mailbox) => mailbox.email === selectedEmail) ?? mailboxes[0] ?? null;
  const snapshot = current ?? EMPTY_SNAPSHOT;
  const savedHost = useCallback((email: string | null) =>
    savedRef.current.find((account) => account.email === email)?.host || null, []);

  /** Connects a new mailbox (host from the form) or re-enters the code of a known one. */
  const connect = useCallback(async (email: string, authorizationCode: string, host?: string) => {
    const key = email.trim().toLowerCase();
    if (host !== undefined) typedHostsRef.current.set(key, host.trim());
    const connected = await run("connect_qq_mail", { email, authorizationCode, host: host?.trim() || savedHost(key) });
    if (connected) { setAdding(false); setSelectedEmail(key); }
    return connected;
  }, [run, savedHost]);
  const setEnabled = useCallback((enabled: boolean) =>
    run("set_qq_mail_enabled", { email: snapshot.email, enabled, host: savedHost(snapshot.email) }), [run, savedHost, snapshot.email]);
  /** The module switch: pause or resume every connected mailbox. */
  const setAllEnabled = useCallback(async (enabled: boolean) => {
    for (const mailbox of mailboxes) {
      if (mailbox.configured && mailbox.enabled !== enabled) {
        await run("set_qq_mail_enabled", { email: mailbox.email, enabled, host: savedHost(mailbox.email) });
      }
    }
  }, [mailboxes, run, savedHost]);
  const refresh = useCallback(() => run("refresh_qq_mail", { email: snapshot.email }), [run, snapshot.email]);
  const disconnect = useCallback(() => {
    if (readerAccountRef.current === snapshot.email) closeReader();
    return run("disconnect_qq_mail", { email: snapshot.email });
  }, [closeReader, run, snapshot.email]);
  const selectMailbox = useCallback((email: string) => { setAdding(false); setSelectedEmail(email); setActionError(null); }, []);
  const startAdding = useCallback(() => { setAdding(true); setActionError(null); }, []);
  /** Opens a mail in the island; the mailbox defaults to the one shown. */
  const readMail = useCallback((message: MailMessage, account?: string | null) => {
    const email = account ?? snapshot.email;
    if (!email) return Promise.resolve(false);
    setAdding(false);
    setSelectedEmail(email);
    return openInReader(email, message);
  }, [openInReader, snapshot.email]);
  const openMail = useCallback(async () => {
    try {
      await openUrl(mailWebUrl(readerAccount ?? snapshot.email));
      clearPreview();
      return true;
    } catch {
      setActionError(t.mail.openFailed);
      return false;
    }
  }, [clearPreview, readerAccount, snapshot.email, t]);
  const openHelp = useCallback(async () => {
    try { await openUrl("https://service.mail.qq.com/"); }
    catch { setActionError(t.mail.helpFailed); }
  }, [t]);

  const previewBox = previewWindow ? mailboxes.find((mailbox) => mailbox.email === previewWindow.email) : undefined;
  const preview = canPreview && previewWindow && previewBox?.enabled && previewBox.status === "connected"
    ? previewBox.items.find((item) => item.id === previewWindow.id && item.unread) ?? null : null;

  return {
    snapshot, mailboxes, adding, busy, actionError, connect, setEnabled, setAllEnabled, refresh, disconnect,
    selectMailbox, startAdding, openMail, openHelp, ...reader, readMail,
    unreadTotal: totalUnread(mailboxes),
    anyConfigured: mailboxes.some((mailbox) => mailbox.configured),
    anyReceiving: mailboxes.some((mailbox) => mailbox.configured && mailbox.enabled),
    preview, previewAccount: preview ? previewWindow?.email ?? null : null,
    previewReceivedAt: preview ? previewWindow?.receivedAt ?? null : null,
  };
}

export type QQMailController = ReturnType<typeof useQQMail>;
