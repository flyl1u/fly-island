import { useTranslation } from "../../../i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { nextQQPreview, type QQPreviewTiming } from "../qqNotificationTiming";
import { getQQMailState, invokeQQMailCommand, listenQQMailChanged, readQQMail, type MailContent, type MailMessage, type MailSnapshot, type QQMailCommand } from "./api";
import { clearMailSettings, loadSettings, saveMailSettings } from "./storage";

const EMPTY_SNAPSHOT: MailSnapshot = {
  revision: 0, email: null, configured: false, enabled: false, syncing: false,
  status: "disconnected", unreadCount: null, items: [], lastSyncedAt: null, error: null,
};

export function useQQMail(canPreview: boolean) {
  const t = useTranslation();
  const translationsRef = useRef(t);
  translationsRef.current = t;
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(isTauri);
  const [selectedMail, setSelectedMail] = useState<MailMessage | null>(null);
  const [content, setContent] = useState<MailContent | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const readerRequestRef = useRef(0);
  const [previewWindow, setPreviewWindow] = useState<{ id: string; receivedAt: number; expiresAt: number } | null>(null);
  const canPreviewRef = useRef(canPreview);
  const revisionRef = useRef(-1);
  const accountRef = useRef<string | null>(null);
  const timingRef = useRef<QQPreviewTiming | null>(null);
  const actionIdRef = useRef(0);

  const clearPreview = useCallback(() => {
    timingRef.current = null;
    setPreviewWindow(null);
  }, []);

  const closeReader = useCallback(() => {
    ++readerRequestRef.current;
    setSelectedMail(null);
    setContent(null);
    setReadError(null);
    setReading(false);
  }, []);

  useLayoutEffect(() => {
    canPreviewRef.current = canPreview;
    if (!canPreview) clearPreview();
  }, [canPreview, clearPreview]);

  const acceptSnapshot = useCallback((next: MailSnapshot, persist = true) => {
    if (next.revision < revisionRef.current) return false;
    revisionRef.current = next.revision;
    if (next.email !== accountRef.current || !next.enabled || next.status !== "connected") clearPreview();
    if (next.email !== accountRef.current || !next.configured || next.status === "authRequired") closeReader();
    accountRef.current = next.email;
    setSnapshot(next);
    if (next.status === "connected" && !next.syncing) setActionError(null);
    if (persist) {
      try {
        if (next.configured && next.email) {
          saveMailSettings({ email: next.email, enabled: next.enabled });
        } else if (next.status === "disconnected" && next.revision > 0) {
          clearMailSettings();
        }
      } catch { setActionError(translationsRef.current.mail.savePreferencesFailed); }
    }
    return true;
  }, [clearPreview, closeReader]);

  useEffect(() => {
    if (!isTauri()) return;
    // A request counter, not a DOM ref: bumping it on unmount drops in-flight reads.
    const readerRequests = readerRequestRef;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const saved = loadSettings();
    void (async () => {
      unlisten = await listenQQMailChanged(({ payload }) => {
        if (cancelled || !acceptSnapshot(payload.snapshot)) return;
        if (!canPreviewRef.current || !payload.windowVisible || !payload.snapshot.enabled
          || payload.snapshot.status !== "connected") {
          clearPreview();
          return;
        }
        if (payload.newestId) {
          const receivedAt = Date.now();
          const { timing, expiresAt } = nextQQPreview(timingRef.current, receivedAt);
          timingRef.current = timing;
          setPreviewWindow(expiresAt === null ? null : { id: payload.newestId, receivedAt, expiresAt });
        }
      });
      if (cancelled) { unlisten(); return; }
      const current = await getQQMailState();
      if (cancelled) return;
      acceptSnapshot(current, false);
      if (!current.email && saved) {
        const restored = await invokeQQMailCommand("set_qq_mail_enabled", saved);
        if (!cancelled) acceptSnapshot(restored);
      }
    })().catch((error: unknown) => {
      if (!cancelled) setActionError(String(error));
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; ++readerRequests.current; unlisten?.(); };
  }, [acceptSnapshot, clearPreview]);

  useEffect(() => {
    if (!previewWindow) return;
    const timer = window.setTimeout(() => setPreviewWindow(null), Math.max(0, previewWindow.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previewWindow]);

  const run = useCallback(async (command: QQMailCommand, args?: Record<string, unknown>) => {
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

  const connect = useCallback((email: string, authorizationCode: string) =>
    run("connect_qq_mail", { email, authorizationCode }), [run]);
  const setEnabled = useCallback((enabled: boolean) =>
    run("set_qq_mail_enabled", { email: snapshot.email, enabled }), [run, snapshot.email]);
  const refresh = useCallback(() => run("refresh_qq_mail"), [run]);
  const disconnect = useCallback(() => { closeReader(); return run("disconnect_qq_mail"); }, [closeReader, run]);
  const readMail = useCallback(async (message: MailMessage) => {
    const requestId = ++readerRequestRef.current;
    setSelectedMail(message);
    setContent(null);
    setReadError(null);
    clearPreview();
    if (!isTauri()) { setReadError(t.mail.desktopRead); setReading(false); return false; }
    setReading(true);
    try {
      const next = await readQQMail(message.id);
      if (requestId !== readerRequestRef.current) return false;
      if (next.id !== message.id) throw new Error(t.mail.changed);
      setContent(next);
      return true;
    } catch (error) {
      if (requestId === readerRequestRef.current) setReadError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      if (requestId === readerRequestRef.current) setReading(false);
    }
  }, [clearPreview, t]);
  const openLink = useCallback(async (href: string) => {
    if (!/^https?:\/\//i.test(href)) return;
    try { await openUrl(href); }
    catch { setActionError(t.mail.openLinkFailed); }
  }, [t]);
  const openMail = useCallback(async () => {
    try {
      await openUrl("https://mail.qq.com/");
      clearPreview();
      return true;
    } catch {
      setActionError(t.mail.openFailed);
      return false;
    }
  }, [clearPreview, t]);
  const openHelp = useCallback(async () => {
    try { await openUrl("https://service.mail.qq.com/"); }
    catch { setActionError(t.mail.helpFailed); }
  }, [t]);

  const preview = canPreview && previewWindow && snapshot.enabled && snapshot.status === "connected"
    ? snapshot.items.find((item) => item.id === previewWindow.id && item.unread) ?? null : null;

  return {
    snapshot, busy, actionError, connect, setEnabled, refresh, disconnect, openMail, openHelp,
    selectedMail, content, reading, readError, readMail, closeReader, openLink,
    preview, previewReceivedAt: preview ? previewWindow?.receivedAt ?? null : null,
  };
}

export type QQMailController = ReturnType<typeof useQQMail>;
