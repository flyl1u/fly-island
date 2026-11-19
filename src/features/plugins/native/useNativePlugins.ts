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

/** Reads the list again: a `storage` event from the settings window is the usual way, this the fallback. */
function reread() {
  onStorage(new StorageEvent("storage", { key: NATIVE_PLUGINS_KEY }));
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorage);
    // Also on reaching the window (the island takes the pointer only over its shape) or focusing it:
    // a plugin installed in the settings window is then on the island by the time anyone looks,
    // even if the storage event never arrived (2026-11-19, owner: installed plugins not on the island).
    window.addEventListener("focus", reread);
    document.documentElement.addEventListener("pointerenter", reread);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", reread);
      document.documentElement.removeEventListener("pointerenter", reread);
    }
  };
}

/** Which built-in plugins are installed, kept in step across windows. */
export function useNativePlugins(): InstalledNativePlugins {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function setNativePluginInstalled(id: NativePluginId, installed: boolean) {
  saveNativePluginInstalled(id, installed);
  reread();
}
