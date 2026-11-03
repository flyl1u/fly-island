import { useTranslation } from "../../../i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowUpRight, KeyRound, Power, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { MessageSourceIcon } from "../MessageSourceIcon";
import { nextQQPreview, type QQPreviewTiming } from "../qqNotificationTiming";
import type { QQNotificationEvent, QQNotificationSnapshot } from "./api";
import { ACCESS_REQUESTED_KEY, ENABLED_KEY } from "./storage";
import "./QQNotifications.css";

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
      unlisten = await listen<QQNotificationEvent>("qq-notifications-changed", ({ payload }) => {
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
      const next = await invoke<QQNotificationSnapshot>("set_qq_notifications_enabled", {
        enabled: window.localStorage.getItem(ENABLED_KEY) !== "false",
      });
      if (!cancelled) acceptSnapshot(next);
      if (!cancelled && next.enabled && window.localStorage.getItem(ACCESS_REQUESTED_KEY) !== "true") {
        // Remember the attempt before invoking so a dismissed prompt never repeats on startup.
        window.localStorage.setItem(ACCESS_REQUESTED_KEY, "true");
        await invoke<string>("request_qq_notification_access");
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
    acceptSnapshot(await invoke<QQNotificationSnapshot>("set_qq_notifications_enabled", { enabled }));
    window.localStorage.setItem(ENABLED_KEY, String(enabled));
    if (!enabled) { timingRef.current = null; setPreviewWindow(null); }
    if (enabled) {
      window.localStorage.setItem(ACCESS_REQUESTED_KEY, "true");
      await invoke<string>("request_qq_notification_access");
    }
  }), [acceptSnapshot, run]);

  const requestAccess = useCallback(() => run(async () => {
    window.localStorage.setItem(ACCESS_REQUESTED_KEY, "true");
    await invoke<string>("request_qq_notification_access");
  }), [run]);

  const openSettings = useCallback(() => run(async () => {
    await invoke("open_qq_notification_settings", {
      access: snapshot.status === "permissionDenied" || snapshot.status === "permissionRequired",
    });
  }), [run, snapshot.status]);

  const refresh = useCallback(() => run(async () => {
    acceptSnapshot(await invoke<QQNotificationSnapshot>("get_qq_notification_state"));
  }), [acceptSnapshot, run]);

  const clear = useCallback(() => run(async () => {
    acceptSnapshot(await invoke<QQNotificationSnapshot>("clear_qq_notifications"));
    setPreviewWindow(null);
  }), [acceptSnapshot, run]);

  const openQQ = useCallback(() => run(async () => {
    await invoke("open_qq");
    setPreviewWindow(null);
  }), [run]);

  return {
    snapshot, busy, actionError, setEnabled, requestAccess, openSettings, refresh, clear, openQQ,
    previewReceivedAt: canPreview ? previewWindow?.receivedAt ?? null : null,
    preview: canPreview && previewWindow
      ? snapshot.items.find((item) => item.id === previewWindow.id) ?? null
      : null,
  };
}

export type QQNotificationsController = ReturnType<typeof useQQNotifications>;

export function QQNotificationControls({ controller, compact = false }: { controller: QQNotificationsController; compact?: boolean }) {
  const { snapshot, busy, actionError, setEnabled, requestAccess, openSettings } = controller;
  const t = useTranslation();
  const needsAccess = snapshot.status === "permissionRequired" || snapshot.status === "permissionDenied";
  return <div className={`qq-panel__controls${compact ? " qq-panel__controls--compact" : ""}`}>
    <div className="qq-panel__control-row">
      {compact ? <button className="icon-button message-receiver-toggle" type="button" role="switch" aria-checked={snapshot.enabled} aria-label={t.qq.receive} title={snapshot.enabled ? t.qq.pause : t.qq.resume} disabled={busy} onClick={() => void setEnabled(!snapshot.enabled)}><Power size={15} strokeWidth={1.8} /></button> : <label className="qq-panel__toggle" title={snapshot.enabled ? t.qq.pause : t.qq.resume}>
        <span>{t.qq.title}</span>
        <span className="message-status" data-state={snapshot.status} role="status" aria-label={t.qq.status[snapshot.status]} title={t.qq.status[snapshot.status]} />
        <input type="checkbox" role="switch" aria-label={t.qq.receive} checked={snapshot.enabled} disabled={busy} onChange={(event) => void setEnabled(event.currentTarget.checked)} />
      </label>}
      {snapshot.enabled && (needsAccess || snapshot.status === "error" || snapshot.error || actionError) && <div className="qq-panel__actions">
        {snapshot.status === "permissionRequired" && <button className="message-action" type="button" title={t.qq.allow} aria-label={t.qq.allowLabel} disabled={busy} onClick={() => void requestAccess()}><KeyRound size={14} strokeWidth={1.8} />{t.qq.grant}</button>}
        {(snapshot.status === "permissionDenied" || snapshot.error || actionError) && <button className="icon-button" type="button" title={t.qq.settings} aria-label={t.qq.settings} disabled={busy} onClick={() => void openSettings()}><Settings2 size={16} strokeWidth={1.8} /></button>}
        {snapshot.status === "error" && <button className="icon-button" type="button" title={t.qq.retry} aria-label={t.qq.retryLabel} disabled={busy} onClick={() => void requestAccess()}><KeyRound size={16} strokeWidth={1.8} /></button>}
      </div>}
    </div>
    {!compact && needsAccess && <p className="qq-panel__error" role="alert">{t.qq.status[snapshot.status]}</p>}
    {!compact && (actionError || snapshot.error) && <p className="qq-panel__error" role="alert">{actionError || snapshot.error}</p>}
  </div>;
}

export function QQNotificationPanel({ controller, navigation }: { controller: QQNotificationsController; navigation: ReactNode }) {
  const { snapshot, busy, actionError, refresh, clear, openQQ } = controller;
  const t = useTranslation();
  const error = actionError || snapshot.error || (snapshot.status === "permissionRequired" || snapshot.status === "permissionDenied" ? t.qq.status[snapshot.status] : null);
  return (
    <section className="qq-panel" aria-label={t.qq.recent}>
      <header className="qq-panel__header">
        {navigation}
        <div className="qq-panel__toolbar">
          <QQNotificationControls controller={controller} compact />
          <button className="icon-button" type="button" title={t.qq.open} aria-label={t.qq.open} disabled={busy} onClick={() => void openQQ()}><ArrowUpRight size={16} strokeWidth={1.8} /></button>
          <button className="icon-button" type="button" title={t.common.refresh} aria-label={t.qq.refresh} disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} strokeWidth={1.8} /></button>
          <button className="icon-button" type="button" title={t.common.clear} aria-label={t.qq.clear} disabled={busy || snapshot.items.length === 0} onClick={() => void clear()}><Trash2 size={16} strokeWidth={1.8} /></button>
        </div>
      </header>
      {error && <p className="qq-panel__error" role="alert">{error}</p>}
      <div className="qq-panel__list" role="list" aria-label={t.qq.list} aria-busy={busy}>
        {snapshot.items.length === 0 ? (
          <div className="qq-panel__empty" role="status"><span className="message-empty-icon"><MessageSourceIcon source="qq" size={28} /></span><span>{t.common.noMessages}</span></div>
        ) : snapshot.items.map((item) => (
          <article className="qq-panel__item" key={item.id} role="listitem">
            <button type="button" disabled={busy} onClick={() => void openQQ()} aria-label={t.qq.openNotification(item.title)}>
              <div className="qq-panel__item-heading"><strong>{item.title}</strong><time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleTimeString(t.localeTag, { hour: "2-digit", minute: "2-digit" })}</time></div>
              {item.body && <p>{item.body}</p>}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
