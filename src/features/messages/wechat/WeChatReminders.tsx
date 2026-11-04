import { useTranslation } from "../../../i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { ArrowUpRight, Power } from "lucide-react";
import { MessageSourceIcon } from "../MessageSourceIcon";
import { launchWeChat, listenWeChatReminderChanged, setWeChatRemindersEnabled, type ReminderSnapshot } from "./api";
import { isWeChatRemindersEnabled, saveWeChatRemindersEnabled } from "./storage";
import "./WeChatReminders.css";

const EMPTY_SNAPSHOT: ReminderSnapshot = {
  revision: 0, enabled: false, status: "disabled", pending: false,
  lastAttentionAt: null, error: null,
};

export function useWeChatReminders(canPreview: boolean) {
  const t = useTranslation();
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [busy, setBusy] = useState(isTauri);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewReceivedAt, setPreviewReceivedAt] = useState<number | null>(null);
  const canPreviewRef = useRef(canPreview);
  const revisionRef = useRef(-1);
  const attentionRef = useRef<number | null>(null);
  const actionPending = useRef(false);

  useLayoutEffect(() => {
    canPreviewRef.current = canPreview;
    if (!canPreview) setPreviewReceivedAt(null);
  }, [canPreview]);

  const acceptSnapshot = useCallback((next: ReminderSnapshot) => {
    if (next.revision < revisionRef.current) return false;
    revisionRef.current = next.revision;
    attentionRef.current = next.lastAttentionAt;
    setSnapshot(next);
    return true;
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenWeChatReminderChanged(({ payload }) => {
        const newlyPending = payload.snapshot.pending
          && payload.snapshot.lastAttentionAt !== attentionRef.current;
        if (cancelled || !acceptSnapshot(payload.snapshot)) return;
        if (!payload.snapshot.enabled || !payload.snapshot.pending
          || payload.snapshot.status !== "listening" || !payload.windowVisible || !canPreviewRef.current) {
          setPreviewReceivedAt(null);
        } else if (newlyPending) {
          setPreviewReceivedAt(Date.now());
        }
      });
      if (cancelled) { unlisten(); return; }
      const next = await setWeChatRemindersEnabled(
        isWeChatRemindersEnabled(),
      );
      if (!cancelled) acceptSnapshot(next);
    })().catch((error: unknown) => {
      if (!cancelled) setActionError(String(error));
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; unlisten?.(); };
  }, [acceptSnapshot]);

  useEffect(() => {
    if (previewReceivedAt === null) return;
    const timer = window.setTimeout(() => setPreviewReceivedAt(null),
      Math.max(0, previewReceivedAt + 5_000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previewReceivedAt]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (actionPending.current) return;
    if (!isTauri()) {
      setActionError(t.wechat.desktopOnly);
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
    acceptSnapshot(await setWeChatRemindersEnabled(enabled));
    saveWeChatRemindersEnabled(enabled);
    if (!enabled) setPreviewReceivedAt(null);
  }), [acceptSnapshot, run]);

  const openWeChat = useCallback(() => run(async () => {
    await launchWeChat();
    setPreviewReceivedAt(null);
  }), [run]);

  return {
    snapshot, busy, actionError, setEnabled, openWeChat,
    previewReceivedAt: canPreview && snapshot.pending ? previewReceivedAt : null,
  };
}

export type WeChatRemindersController = ReturnType<typeof useWeChatReminders>;

export function WeChatReminderControls({ controller, compact = false }: { controller: WeChatRemindersController; compact?: boolean }) {
  const { snapshot, busy, actionError, setEnabled } = controller;
  const t = useTranslation();
  return <div className={`qq-panel__controls${compact ? " qq-panel__controls--compact" : ""}`}>
    {compact ? <button className="icon-button message-receiver-toggle" type="button" role="switch" aria-checked={snapshot.enabled} aria-label={t.wechat.receive} title={snapshot.enabled ? t.wechat.pause : t.wechat.receive} disabled={busy} onClick={() => void setEnabled(!snapshot.enabled)}><Power size={15} strokeWidth={1.8} /></button> : <label className="qq-panel__toggle" title={snapshot.enabled ? t.wechat.pause : t.wechat.receive}>
      <span>{t.messages.wechatReminders}</span>
      <span className="message-status" data-state={snapshot.status} role="status" aria-label={t.wechat.status[snapshot.status]} title={t.wechat.status[snapshot.status]} />
      <input type="checkbox" role="switch" aria-label={t.wechat.receive} checked={snapshot.enabled} disabled={busy}
        onChange={(event) => void setEnabled(event.currentTarget.checked)} />
    </label>}
    {!compact && (actionError || snapshot.error) && <p className="qq-panel__error" role="alert">{actionError || snapshot.error}</p>}
  </div>;
}

export function WeChatReminderPanel({ controller, navigation }: { controller: WeChatRemindersController; navigation: ReactNode }) {
  const { snapshot, busy, actionError, openWeChat } = controller;
  const t = useTranslation();
  const pending = snapshot.enabled && snapshot.status === "listening" && snapshot.pending;
  const label = snapshot.status === "listening" ? pending ? t.messages.newReminder : t.wechat.noReminders : t.wechat.status[snapshot.status];
  return (
    <section className="qq-panel" aria-label={t.messages.wechatReminders}>
      <header className="qq-panel__header">
        {navigation}
        <div className="qq-panel__toolbar"><WeChatReminderControls controller={controller} compact /><button className="icon-button" type="button" title={t.wechat.open} aria-label={t.wechat.open} disabled={busy} onClick={() => void openWeChat()}><ArrowUpRight size={16} strokeWidth={1.8} /></button></div>
      </header>
      {(actionError || snapshot.error) && <p className="qq-panel__error" role="alert">{actionError || snapshot.error}</p>}
      <div className={`qq-panel__empty${pending ? " wechat-reminder-state--pending" : ""}`} role="status">
        <span className="message-empty-icon"><MessageSourceIcon source="wechat" size={28} /></span>
        <span>{label}</span>
      </div>
    </section>
  );
}
