import { useEffect, useSyncExternalStore } from "react";
import { getPlugins, onPluginsChanged, type PluginsSnapshot } from "./api";

const EMPTY: PluginsSnapshot = { registry: { developerMode: false, indexUrl: "", installed: {} }, live: {} };
let current = EMPTY;
const listeners = new Set<() => void>();
let reading = false;
let dirty = false;
export async function refreshPlugins() {
  if (reading) { dirty = true; return; }
  reading = true;
  try {
    const next = await getPlugins();
    if (!next?.registry?.installed || !next.live) return;
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      current = next;
      listeners.forEach((listener) => listener());
    }
  } catch { /* Old web demos have no native plugin host. */ }
  finally {
    reading = false;
    if (dirty) { dirty = false; void refreshPlugins(); }
  }
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function usePlugins() {
  const snapshot = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onPluginsChanged(() => { void refreshPlugins(); }).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
      void refreshPlugins();
    }).catch(() => { void refreshPlugins(); });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  return snapshot;
}
