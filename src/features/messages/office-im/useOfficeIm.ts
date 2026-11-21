import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useNativePlugins } from "../../plugins";
import { OFFICE_SOURCES, type MessagePreview, type OfficeSource } from "../messagePreview";
import { clearOfficeIm, getOfficeImState, listenOfficeImChanged, openOfficeIm, setOfficeImEnabled, type OfficeClientState, type OfficeImSnapshot } from "./api";
import { loadOfficeImEnabled, OFFICE_IM_ENABLED_KEY, saveOfficeImEnabled, type OfficeImEnabled } from "./storage";

const IDLE: OfficeClientState = { enabled: false, status: "disabled", pending: false, lastAttentionAt: null, error: null };
const EMPTY: OfficeImSnapshot = { revision: -1, dingtalk: IDLE, feishu: IDLE, wecom: IDLE };

// One native snapshot per window, shared by the tabs, the panels and the collapsed preview.
let current = EMPTY;
const listeners = new Set<() => void>();
const attentionListeners = new Set<(source: OfficeSource) => void>();
let stop: (() => void) | undefined;

function accept(next: OfficeImSnapshot | null | undefined) {
  // Web builds and older mocks answer without a native snapshot.
  if (!next || typeof next.revision !== "number" || !OFFICE_SOURCES.every((source) => next[source])) return;
  if (current.revision >= 0 && next.revision <= current.revision) return;
  const previous = current;
  current = next;
  listeners.forEach((listener) => listener());
  // The first snapshot only records what was already pending: a restart replays nothing.
  if (previous.revision < 0) return;
  for (const source of OFFICE_SOURCES) {
    if (next[source].pending && next[source].lastAttentionAt !== previous[source].lastAttentionAt) {
      attentionListeners.forEach((listener) => listener(source));
    }
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && isTauri()) {
    let disposed = false;
    stop = () => { disposed = true; };
    void listenOfficeImChanged(({ payload }) => accept(payload)).then((unlisten) => {
      if (disposed) unlisten(); else stop = unlisten;
    }).catch(() => undefined);
    void getOfficeImState().then(accept).catch(() => undefined);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { stop?.(); stop = undefined; }
  };
}

export function useOfficeImSnapshot(): OfficeImSnapshot {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/** Each office client's switch, saved per client and kept in step across windows. */
export function useOfficeImEnabled(): [OfficeImEnabled, (source: OfficeSource, enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(loadOfficeImEnabled);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === OFFICE_IM_ENABLED_KEY) setEnabled(loadOfficeImEnabled());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const save = useCallback((source: OfficeSource, on: boolean) => {
    saveOfficeImEnabled(source, on);
    setEnabled(loadOfficeImEnabled());
  }, []);
  return [enabled, save];
}

/** Which office clients show on the island: installed in the plugin market and switched on. */
export function useOfficeSources(): Record<OfficeSource, boolean> {
  const installed = useNativePlugins();
  const [enabled] = useOfficeImEnabled();
  return { dingtalk: installed.dingtalk && enabled.dingtalk, feishu: installed.feishu && enabled.feishu, wecom: installed.wecom && enabled.wecom };
}

/** The first office client shown on the island with a reminder not yet read, for the header bell. */
export function usePendingOfficeSource(): OfficeSource | null {
  const snapshot = useOfficeImSnapshot();
  const wanted = useOfficeSources();
  return OFFICE_SOURCES.find((source) => wanted[source] && snapshot[source].pending) ?? null;
}

/** Brings the client forward; its reminder counts as read either way. */
export async function openOfficeClient(source: OfficeSource) {
  await openOfficeIm(source);
}

export async function clearOfficeClient(source: OfficeSource) {
  accept(await clearOfficeIm(source));
}

/**
 * The island's side (main window only): starts and stops the native listener to match the
 * switches, and pops up a preview when a client starts flashing.
 */
export function useOfficeIm(canPreview: boolean, previewSeconds: number) {
  const snapshot = useOfficeImSnapshot();
  const wanted = useOfficeSources();
  const [previewWindow, setPreviewWindow] = useState<{ source: OfficeSource; receivedAt: number; expiresAt: number } | null>(null);
  const options = useRef({ canPreview, previewSeconds });
  useEffect(() => { options.current = { canPreview, previewSeconds }; }, [canPreview, previewSeconds]);

  const ready = snapshot.revision >= 0;
  const { dingtalk, feishu, wecom } = wanted;
  useEffect(() => {
    if (!ready) return;
    const next = { dingtalk, feishu, wecom };
    for (const source of OFFICE_SOURCES) {
      if (current[source].enabled !== next[source]) void setOfficeImEnabled(source, next[source]).then(accept).catch(() => undefined);
    }
  }, [ready, dingtalk, feishu, wecom]);

  useEffect(() => {
    const onAttention = (source: OfficeSource) => {
      if (!options.current.canPreview) return;
      setPreviewWindow((previous) => {
        const receivedAt = Math.max(Date.now(), (previous?.receivedAt ?? 0) + 1);
        return { source, receivedAt, expiresAt: receivedAt + options.current.previewSeconds * 1_000 };
      });
    };
    attentionListeners.add(onAttention);
    return () => { attentionListeners.delete(onAttention); };
  }, []);

  useEffect(() => {
    if (!previewWindow) return;
    const timer = window.setTimeout(() => setPreviewWindow(null), Math.max(0, previewWindow.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previewWindow]);

  const shown = previewWindow && canPreview && wanted[previewWindow.source] && snapshot[previewWindow.source].pending ? previewWindow : null;
  const preview: MessagePreview | null = shown ? { source: shown.source, title: "", body: "", receivedAt: shown.receivedAt } : null;
  return { snapshot, preview };
}
