import { useSyncExternalStore } from "react";
import type { NativePluginId } from "./catalog.ts";
import { loadInstalledNativePlugins, NATIVE_PLUGINS_KEY, saveNativePluginInstalled, type InstalledNativePlugins } from "./storage.ts";

// One snapshot per window, refreshed by `storage` events: the settings window installs, the
// island (another window) picks it up; same-window writes announce themselves too.
let current: InstalledNativePlugins | null = null;
const listeners = new Set<() => void>();

function snapshot() {
  current ??= loadInstalledNativePlugins();
  return current;
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== NATIVE_PLUGINS_KEY) return;
  const next = loadInstalledNativePlugins();
  if (current && Object.entries(next).every(([id, value]) => current?.[id as NativePluginId] === value)) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Which built-in plugins are installed, kept in step across windows. */
export function useNativePlugins(): InstalledNativePlugins {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function setNativePluginInstalled(id: NativePluginId, installed: boolean) {
  saveNativePluginInstalled(id, installed);
  onStorage(new StorageEvent("storage", { key: NATIVE_PLUGINS_KEY }));
}
