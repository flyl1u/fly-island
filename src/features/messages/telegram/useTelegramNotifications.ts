import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MessagePreview } from "../messagePreview";
import {
  activateTelegramNotice, getTelegramNotifications, launchTelegram, listenTelegramNotifications, openTelegramAccessSettings,
  requestTelegramAccess, setTelegramEnabled, type TelegramSnapshot,
} from "./api";
import { useTelegramEnabled, useTelegramWanted } from "./useTelegramEnabled";

const EMPTY: TelegramSnapshot = { revision: -1, enabled: false, status: "disabled", items: [], error: null };

/**
 * `island` (main window only) starts and stops the native listener to match the plugin and its
 * switch, as the office clients do; the settings window saves the switch and follows.
 */
export function useTelegramNotifications(canPreview = false, previewSeconds = 5, island = false) {
  const wanted = useTelegramWanted();
  const [, saveEnabled] = useTelegramEnabled();
  const nativeEnabled = useRef(false);
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
    nativeEnabled.current = next.enabled;
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
    })().catch((error: unknown) => {
      if (!cancelled) setActionError(String(error));
    });
    return () => { cancelled = true; unlisten?.(); };
  }, [accept]);

  // Without the plugin both sides are off already, so nothing is called and nothing listens.
  const ready = snapshot.revision >= 0;
  useEffect(() => {
    if (!island || !ready || nativeEnabled.current === wanted) return;
    void setTelegramEnabled(wanted).then(accept).catch((error: unknown) => setActionError(String(error)));
  }, [island, ready, wanted, accept]);

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

  const active = wanted && snapshot.enabled;
  const item = shown && canPreview && (!island || wanted) ? snapshot.items.find(({ id }) => id === shown.id) : undefined;
  const preview: MessagePreview | null = item && shown ? {
    source: "telegram", telegramId: item.id, title: item.title, body: item.body, receivedAt: shown.receivedAt,
  } : null;

  return {
    snapshot, active, actionError, busy, preview,
    setEnabled: (enabled: boolean) => run(async () => {
      // Saved first, so the island that follows the switch never sets it back.
      if (!saveEnabled(enabled)) throw new Error("storage unavailable");
      const next = await setTelegramEnabled(enabled).catch((error: unknown) => {
        saveEnabled(!enabled);
        throw error;
      });
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
