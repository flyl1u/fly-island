import { useTranslation } from "../../../i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { MessagePreview } from "../messagePreview";
import {
  clearWeChatReminders, dismissWeChatConversation, getWeChatReminderState, launchWeChat, launchWeChatConversation, listenWeChatReminderChanged,
  setWeChatMessagePreviewEnabled, setWeChatMinimizedTaskbarHidden, setWeChatRemindersEnabled, type ReminderSnapshot,
} from "./api";
import {
  isWeChatMessagePreviewEnabled, isWeChatMinimizedTaskbarHidden, isWeChatRemindersEnabled,
  saveWeChatMessagePreviewEnabled, saveWeChatMinimizedTaskbarHidden, saveWeChatRemindersEnabled,
} from "./storage";
import { weChatOpenErrorText } from "./openError";

const EMPTY_SNAPSHOT: ReminderSnapshot = {
  revision: 0, enabled: false, status: "disabled", pending: false,
  lastAttentionAt: null, error: null,
  previewEnabled: false, previewStatus: "off", hideMinimizedTaskbar: false, messages: [],
};

export function useWeChatReminders(canPreview: boolean, { restore = true, previewSeconds = 5 } = {}) {
  const t = useTranslation();
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [busy, setBusy] = useState(isTauri);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewWindow, setPreviewWindow] = useState<{ receivedAt: number; expiresAt: number } | null>(null);
  const previewSecondsRef = useRef(previewSeconds);
  const canPreviewRef = useRef(canPreview);
  const revisionRef = useRef(-1);
  const attentionRef = useRef<number | null>(null);
  const actionPending = useRef(false);

  useLayoutEffect(() => { previewSecondsRef.current = previewSeconds; }, [previewSeconds]);

  useLayoutEffect(() => {
    canPreviewRef.current = canPreview;
    if (!canPreview) setPreviewWindow(null);
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
          setPreviewWindow(null);
        } else if (newlyPending) {
          setPreviewWindow((previous) => {
            const receivedAt = Math.max(Date.now(), (previous?.receivedAt ?? 0) + 1);
            return { receivedAt, expiresAt: receivedAt + previewSecondsRef.current * 1_000 };
          });
        }
      });
      if (cancelled) { unlisten(); return; }
      const next = restore
        ? await setWeChatRemindersEnabled(isWeChatRemindersEnabled(), isWeChatMessagePreviewEnabled(), isWeChatMinimizedTaskbarHidden())
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
    if (previewWindow === null) return;
    const timer = window.setTimeout(() => setPreviewWindow(null),
      Math.max(0, previewWindow.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previewWindow]);

  const run = useCallback(async (action: () => Promise<void | boolean>) => {
    if (actionPending.current) return;
    if (!isTauri()) {
      setActionError(t.wechat.desktopOnly);
      return false;
    }
    actionPending.current = true;
    setBusy(true);
    setActionError(null);
    try {
      return (await action()) !== false;
    } catch (error) {
      setActionError(weChatOpenErrorText(error, t.wechat.openErrors));
      return false;
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }, [t]);

  const setEnabled = useCallback((enabled: boolean) => run(async () => {
    acceptSnapshot(await setWeChatRemindersEnabled(enabled));
    saveWeChatRemindersEnabled(enabled);
    if (!enabled) setPreviewWindow(null);
  }), [acceptSnapshot, run]);

  const clear = useCallback(() => run(async () => {
    acceptSnapshot(await clearWeChatReminders());
    setPreviewWindow(null);
  }), [acceptSnapshot, run]);

  const setPreviewEnabled = useCallback((enabled: boolean) => run(async () => {
    acceptSnapshot(await setWeChatMessagePreviewEnabled(enabled));
    saveWeChatMessagePreviewEnabled(enabled);
    if (!enabled) setPreviewWindow(null);
  }), [acceptSnapshot, run]);

  const setHideMinimizedTaskbar = useCallback((hidden: boolean) => run(async () => {
    acceptSnapshot(await setWeChatMinimizedTaskbarHidden(hidden));
    saveWeChatMinimizedTaskbarHidden(hidden);
  }), [acceptSnapshot, run]);

  /** Opening one conversation reads all of its previews; the other chats stay. */
  const openWeChat = useCallback((messageId?: string) => run(async () => {
    let opened = true;
    if (messageId) {
      opened = await launchWeChatConversation(messageId);
      if (!opened) setActionError(t.wechat.jumpUnavailable);
      // WeChat is already open; a list that failed to update is not worth an error.
      await dismissWeChatConversation(messageId).then(acceptSnapshot).catch(() => undefined);
    } else {
      await launchWeChat();
    }
    setPreviewWindow(null);
    return opened;
  }), [acceptSnapshot, run, t.wechat.jumpUnavailable]);

  const latest = snapshot.messages[0];
  const message = latest?.receivedAt === snapshot.lastAttentionAt ? latest : undefined;
  const preview: MessagePreview | null = canPreview && snapshot.pending && previewWindow !== null ? {
    source: "wechat", title: message?.contact ?? "", body: message?.body ?? "", receivedAt: previewWindow.receivedAt,
    wechatMessageId: message?.id,
  } : null;
  return { snapshot, busy, actionError, clear, setEnabled, setPreviewEnabled, setHideMinimizedTaskbar, openWeChat, preview };
}

export type WeChatRemindersController = ReturnType<typeof useWeChatReminders>;
