import { useTranslation } from "../../../i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { MessagePreview } from "../messagePreview";
import { getWeChatReminderState, launchWeChat, listenWeChatReminderChanged, setWeChatMessagePreviewEnabled, setWeChatRemindersEnabled, type ReminderSnapshot } from "./api";
import { isWeChatMessagePreviewEnabled, isWeChatRemindersEnabled, saveWeChatMessagePreviewEnabled, saveWeChatRemindersEnabled } from "./storage";

const EMPTY_SNAPSHOT: ReminderSnapshot = {
  revision: 0, enabled: false, status: "disabled", pending: false,
  lastAttentionAt: null, error: null,
  previewEnabled: false, previewStatus: "off", messages: [],
};

export function useWeChatReminders(canPreview: boolean, { restore = true } = {}) {
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
      const next = restore
        ? await setWeChatRemindersEnabled(isWeChatRemindersEnabled(), isWeChatMessagePreviewEnabled())
        : await getWeChatReminderState();
      if (!cancelled) acceptSnapshot(next);
    })().catch((error: unknown) => {
      if (!cancelled) setActionError(String(error));
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; unlisten?.(); };
  }, [acceptSnapshot, restore]);

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

  const setPreviewEnabled = useCallback((enabled: boolean) => run(async () => {
    acceptSnapshot(await setWeChatMessagePreviewEnabled(enabled));
    saveWeChatMessagePreviewEnabled(enabled);
    if (!enabled) setPreviewReceivedAt(null);
  }), [acceptSnapshot, run]);

  const openWeChat = useCallback(() => run(async () => {
    await launchWeChat();
    setPreviewReceivedAt(null);
  }), [run]);

  const latest = snapshot.messages[0];
  const message = latest?.receivedAt === snapshot.lastAttentionAt ? latest : undefined;
  const preview: MessagePreview | null = canPreview && snapshot.pending && previewReceivedAt !== null ? {
    source: "wechat", title: message?.contact ?? "", body: message?.body ?? "", receivedAt: previewReceivedAt,
  } : null;
  return { snapshot, busy, actionError, setEnabled, setPreviewEnabled, openWeChat, preview };
}

export type WeChatRemindersController = ReturnType<typeof useWeChatReminders>;
