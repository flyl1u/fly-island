import { useSyncExternalStore } from "react";
import { PLUGIN_MARKET_ENABLED } from "../../releaseFlags.ts";
import { NATIVE_PLUGIN_IDS, type NativePluginId } from "./catalog.ts";
import {
  DISABLED_NATIVE_PLUGINS_KEY, NATIVE_PLUGINS_KEY, loadNativePluginStates, normalizeNativePluginStates,
  saveNativePluginEnabled, saveNativePluginInstalled, type NativePluginStates,
} from "./storage.ts";

// One snapshot per window, refreshed after local writes and across windows via storage events.
let current: NativePluginStates | null = null;
const listeners = new Set<() => void>();

function snapshot() {
  current ??= loadNativePluginStates();
  return current;
}

function reread() {
  const next = loadNativePluginStates();
  const previous = current;
  if (previous && NATIVE_PLUGIN_IDS.every((id) =>
    next.installed[id] === previous.installed[id] && next.enabled[id] === previous.enabled[id])) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === NATIVE_PLUGINS_KEY || event.key === DISABLED_NATIVE_PLUGINS_KEY) reread();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    // Webviews can miss a storage event. Reread on focus or when the island takes the pointer.
    window.addEventListener("focus", reread);
    document.documentElement.addEventListener("pointerenter", reread);
    reread();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", reread);
      document.documentElement.removeEventListener("pointerenter", reread);
    }
  };
}

const NONE = normalizeNativePluginStates([], []);
const noSubscription = () => () => {};
const none = () => NONE;
const getSnapshot = PLUGIN_MARKET_ENABLED ? snapshot : none;

/** Installation and effective enabled state for the market cards. */
export function useNativePluginStates(): NativePluginStates {
  return useSyncExternalStore(PLUGIN_MARKET_ENABLED ? subscribe : noSubscription, getSnapshot, getSnapshot);
}

/** Which built-in plugins are installed and enabled. */
export function useNativePlugins() {
  return useNativePluginStates().enabled;
}

export function setNativePluginInstalled(id: NativePluginId, installed: boolean) {
  saveNativePluginInstalled(id, installed);
  reread();
}

export function setNativePluginEnabled(id: NativePluginId, enabled: boolean) {
  saveNativePluginEnabled(id, enabled);
  reread();
}
