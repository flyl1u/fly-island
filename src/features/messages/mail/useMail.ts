import { useTranslation } from "../../../i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { nextQQPreview, type QQPreviewTiming } from "../qqNotificationTiming";
import type { MailEvent, MailMessage, MailSnapshot } from "./api";
import { mailWebUrl } from "./mailDomain";
import { useMailAccounts } from "./useMailAccounts";
import { useMailReader } from "./useMailReader";
import { useMarkAllRead } from "./useMarkAllRead";

const EMPTY_SNAPSHOT: MailSnapshot = {
  revision: 0, email: null, configured: false, enabled: false, syncing: false,
  status: "disconnected", unreadCount: null, items: [], lastSyncedAt: null, error: null,
};

type PreviewWindow = { email: string; id: string; receivedAt: number; expiresAt: number };

/** The island's mail: which mailbox tab is shown, new-mail previews and the reader. */
export function useMail(canPreview: boolean) {
  const t = useTranslation();
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [previewWindow, setPreviewWindow] = useState<PreviewWindow | null>(null);
  const previewRef = useRef<PreviewWindow | null>(null);
  const canPreviewRef = useRef(canPreview);
  const timingRef = useRef<QQPreviewTiming | null>(null);
  const reportErrorRef = useRef<(message: string) => void>(() => {});

  const showPreview = useCallback((next: PreviewWindow | null) => {
    previewRef.current = next;
    setPreviewWindow(next);
  }, []);
  const clearPreview = useCallback(() => {
    timingRef.current = null;
    showPreview(null);
  }, [showPreview]);
  const reportError = useCallback((message: string) => reportErrorRef.current(message), []);
  const reader = useMailReader(t, clearPreview, reportError);
  const { closeReader, readerAccount, readMail: openInReader } = reader;
  const readerAccountRef = useRef(readerAccount);
  readerAccountRef.current = readerAccount;

  const onSnapshot = useCallback((next: MailSnapshot) => {
    if (previewRef.current?.email === next.email && (!next.enabled || next.status !== "connected")) clearPreview();
    if (readerAccountRef.current === next.email && (!next.configured || next.status === "authRequired")) closeReader();
  }, [clearPreview, closeReader]);
  const onEvent = useCallback((event: MailEvent) => {
    if (!canPreviewRef.current || !event.windowVisible) { clearPreview(); return; }
    const { email, enabled, status } = event.snapshot;
    if (event.newestId && email && enabled && status === "connected") {
      const receivedAt = Date.now();
      const { timing, expiresAt } = nextQQPreview(timingRef.current, receivedAt);
      timingRef.current = timing;
      showPreview(expiresAt === null ? null : { email, id: event.newestId, receivedAt, expiresAt });
    }
  }, [clearPreview, showPreview]);
  const accounts = useMailAccounts({ restore: true, onSnapshot, onEvent });
  const { mailboxes, setActionError } = accounts;
  reportErrorRef.current = setActionError;

  useLayoutEffect(() => {
    canPreviewRef.current = canPreview;
    if (!canPreview) clearPreview();
  }, [canPreview, clearPreview]);

  useEffect(() => {
    if (!previewWindow) return;
    const timer = window.setTimeout(() => showPreview(null), Math.max(0, previewWindow.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previewWindow, showPreview]);

  const snapshot = mailboxes.find((mailbox) => mailbox.email === selectedEmail) ?? mailboxes[0] ?? EMPTY_SNAPSHOT;
  const email = snapshot.email;
  const { markingAll, markAllRead } = useMarkAllRead(snapshot, accounts);
  const { setEnabled: setMailboxEnabled, refresh: refreshMailbox } = accounts;

  const setEnabled = useCallback((enabled: boolean) =>
    email ? setMailboxEnabled(email, enabled) : Promise.resolve(false), [email, setMailboxEnabled]);
  const refresh = useCallback(() => (email ? refreshMailbox(email) : Promise.resolve(false)), [email, refreshMailbox]);
  const selectMailbox = useCallback((next: string) => { setSelectedEmail(next); setActionError(null); }, [setActionError]);
  /** Opens a mail in the island; the mailbox defaults to the one shown. */
  const readMail = useCallback((message: MailMessage, account?: string | null) => {
    const target = account ?? email;
    if (!target) return Promise.resolve(false);
    setSelectedEmail(target);
    return openInReader(target, message);
  }, [email, openInReader]);
  const openMail = useCallback(async () => {
    try {
      await openUrl(mailWebUrl(readerAccount ?? email));
      clearPreview();
      return true;
    } catch {
      setActionError(t.mail.openFailed);
      return false;
    }
  }, [clearPreview, email, readerAccount, setActionError, t]);

  const previewBox = previewWindow ? mailboxes.find((mailbox) => mailbox.email === previewWindow.email) : undefined;
  const preview = canPreview && previewWindow && previewBox?.enabled && previewBox.status === "connected"
    ? previewBox.items.find((item) => item.id === previewWindow.id && item.unread) ?? null : null;

  return {
    ...accounts, ...reader, snapshot, setEnabled, refresh, selectMailbox, readMail, openMail, markAllRead,
    busy: accounts.busy || markingAll,
    /** Reading a mail: the island gives the panel more height. */
    wantsTallPanel: Boolean(reader.selectedMail),
    preview, previewAccount: preview ? previewWindow?.email ?? null : null,
    previewReceivedAt: preview ? previewWindow?.receivedAt ?? null : null,
  };
}

export type MailController = ReturnType<typeof useMail>;
