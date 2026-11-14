import { useTranslation } from "../../../i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { nextQQPreview, type QQPreviewTiming } from "../qqNotificationTiming";
import { clearQQNotifications, dismissQQContact, getQQNotificationState, launchQQ, listenQQNotificationsChanged, openQQNotificationSettings, requestQQNotificationAccess, setQQNotificationsEnabled, type QQNotificationSnapshot } from "./api";
import { hasRequestedQQNotificationAccess, isQQNotificationsEnabled, markQQNotificationAccessRequested, saveQQNotificationsEnabled } from "./storage";

const EMPTY_SNAPSHOT: QQNotificationSnapshot = {
  revision: 0,
  enabled: false,
  status: "disabled",
  items: [],
  error: null,
};

export function useQQNotifications(canPreview: boolean) {
  const t = useTranslation();
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(isTauri);
  const [previewWindow, setPreviewWindow] = useState<{ id: string; expiresAt: number; receivedAt: number } | null>(null);
  const canPreviewRef = useRef(canPreview);
  const revisionRef = useRef(-1);
  const timingRef = useRef<QQPreviewTiming | null>(null);
  const actionPending = useRef(false);

  useLayoutEffect(() => {
    canPreviewRef.current = canPreview;
    if (!canPreview) {
      timingRef.current = null;
      setPreviewWindow(null);
    }
  }, [canPreview]);

  const acceptSnapshot = useCallback((next: QQNotificationSnapshot) => {
    if (next.revision < revisionRef.current) return false;
    revisionRef.current = next.revision;
    setSnapshot(next);
    return true;
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenQQNotificationsChanged(({ payload }) => {
        if (cancelled || !acceptSnapshot(payload.snapshot)) return;
        if (!payload.snapshot.enabled || !payload.windowVisible || !canPreviewRef.current) {
          setPreviewWindow(null);
          timingRef.current = null;
          return;
        }
        if (payload.newestId) {
          const receivedAt = Date.now();
          const { timing, expiresAt } = nextQQPreview(timingRef.current, receivedAt);
          timingRef.current = timing;
          setPreviewWindow(expiresAt === null ? null : { id: payload.newestId, expiresAt, receivedAt });
        }
      });
      if (cancelled) { unlisten(); return; }
      const next = await setQQNotificationsEnabled(
        isQQNotificationsEnabled(),
      );
      if (!cancelled) acceptSnapshot(next);
      if (!cancelled && next.enabled && !hasRequestedQQNotificationAccess()) {
        // Remember the attempt before invoking so a dismissed prompt never repeats on startup.
        markQQNotificationAccessRequested();
        await requestQQNotificationAccess();
      }
    })().catch((error: unknown) => {
      if (!cancelled) setActionError(String(error));
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; unlisten?.(); };
  }, [acceptSnapshot]);

  useEffect(() => {
    if (!previewWindow) return;
    const timer = window.setTimeout(() => setPreviewWindow(null), Math.max(0, previewWindow.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previewWindow]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (actionPending.current) return;
    if (!isTauri()) {
      setActionError(t.qq.desktopOnly);
      return false;
    }
    actionPending.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(String(error));
      return false;
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }, [t]);

  const setEnabled = useCallback((enabled: boolean) => run(async () => {
    acceptSnapshot(await setQQNotificationsEnabled(enabled));
    saveQQNotificationsEnabled(enabled);
    if (!enabled) { timingRef.current = null; setPreviewWindow(null); }
    if (enabled) {
      markQQNotificationAccessRequested();
      await requestQQNotificationAccess();
    }
  }), [acceptSnapshot, run]);

  const requestAccess = useCallback(() => run(async () => {
    markQQNotificationAccessRequested();
    await requestQQNotificationAccess();
  }), [run]);

  const openSettings = useCallback(() => run(async () => {
    await openQQNotificationSettings(
      snapshot.status === "permissionDenied" || snapshot.status === "permissionRequired",
    );
  }), [run, snapshot.status]);

  const refresh = useCallback(() => run(async () => {
    acceptSnapshot(await getQQNotificationState());
  }), [acceptSnapshot, run]);

  const clear = useCallback(() => run(async () => {
    acceptSnapshot(await clearQQNotifications());
    setPreviewWindow(null);
  }), [acceptSnapshot, run]);

  /** Opening from one contact's message reads that contact's messages; the others stay. */
  const openQQ = useCallback((contact?: string) => run(async () => {
    await launchQQ();
    setPreviewWindow(null);
    // QQ is already open; a list that failed to update is not worth an error.
    if (contact !== undefined) await dismissQQContact(contact).then(acceptSnapshot).catch(() => undefined);
  }), [acceptSnapshot, run]);

  return {
    snapshot, busy, actionError, setEnabled, requestAccess, openSettings, refresh, clear, openQQ,
    previewReceivedAt: canPreview ? previewWindow?.receivedAt ?? null : null,
    preview: canPreview && previewWindow
      ? snapshot.items.find((item) => item.id === previewWindow.id) ?? null
      : null,
  };
}

export type QQNotificationsController = ReturnType<typeof useQQNotifications>;
