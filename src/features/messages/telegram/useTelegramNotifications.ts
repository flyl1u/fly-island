import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MessagePreview } from "../messagePreview";
import {
  activateTelegramNotice, getTelegramNotifications, launchTelegram, listenTelegramNotifications, openTelegramAccessSettings,
  requestTelegramAccess, setTelegramEnabled, type TelegramSnapshot,
} from "./api";
import { isTelegramEnabled, saveTelegramEnabled } from "./storage";

const EMPTY: TelegramSnapshot = { revision: -1, enabled: false, status: "disabled", items: [], error: null };

export function useTelegramNotifications(canPreview = false, previewSeconds = 5, restore = false) {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<{ id: string; receivedAt: number; duration: number } | null>(null);
  const revision = useRef(-1);
  const pending = useRef(false);
  const previewOptions = useRef({ canPreview, previewSeconds });
  useLayoutEffect(() => {
    previewOptions.current = { canPreview, previewSeconds };
    if (!canPreview) setShown(null);
  }, [canPreview, previewSeconds]);

  const accept = useCallback((next: TelegramSnapshot) => {
    if (next.revision <= revision.current) return false;
    revision.current = next.revision;
    setSnapshot(next);
    return true;
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenTelegramNotifications(({ payload }) => {
        if (cancelled || !accept(payload.snapshot)) return;
        const { canPreview, previewSeconds } = previewOptions.current;
        if (payload.newestId && canPreview) {
          setShown({ id: payload.newestId, receivedAt: Date.now(), duration: previewSeconds * 1000 });
        }
      });
      if (cancelled) { unlisten(); return; }
      const next = await getTelegramNotifications();
      if (cancelled || !next) return;
      accept(next);
      if (restore && !next.enabled && isTelegramEnabled()) {
        const enabled = await setTelegramEnabled(true);
        if (!cancelled) accept(enabled);
      }
    })().catch((error: unknown) => {
      if (!cancelled) setActionError(String(error));
    });
    return () => { cancelled = true; unlisten?.(); };
  }, [accept, restore]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), shown.duration);
    return () => window.clearTimeout(timer);
  }, [shown]);

  const run = async (action: () => Promise<void>) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(String(error));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const item = shown && canPreview ? snapshot.items.find(({ id }) => id === shown.id) : undefined;
  const preview: MessagePreview | null = item && shown ? {
    source: "telegram", telegramId: item.id, title: item.title, body: item.body, receivedAt: shown.receivedAt,
  } : null;

  return {
    snapshot, actionError, busy, preview,
    setEnabled: (enabled: boolean) => run(async () => {
      const next = await setTelegramEnabled(enabled);
      saveTelegramEnabled(enabled);
      accept(next);
      if (enabled && next.status !== "listening") await requestTelegramAccess();
    }),
    requestAccess: () => run(requestTelegramAccess),
    openSettings: () => run(openTelegramAccessSettings),
    openNotice: (id: string) => run(async () => { accept(await activateTelegramNotice(id)); }),
    openApp: () => run(launchTelegram),
  };
}

export type TelegramNotificationsController = ReturnType<typeof useTelegramNotifications>;
