import { useSyncExternalStore } from "react";
import { getPlugins, onPluginsChanged, type PluginsSnapshot } from "./api";
import { PLUGIN_RUNTIME_ENABLED } from "../releaseFlags.ts";

const EMPTY: PluginsSnapshot = { registry: { developerMode: false, indexUrl: "", installed: {} }, live: {} };
let current = EMPTY;
const listeners = new Set<() => void>();
let reading: Promise<void> | undefined;
let dirty = false;
let generation = 0;
let unlisten: (() => void) | undefined;

async function readPending() {
  while (dirty) {
    dirty = false;
    try {
      const next = await getPlugins();
      if (next?.registry?.installed && next.live && JSON.stringify(next) !== JSON.stringify(current)) {
        current = next;
        listeners.forEach((listener) => listener());
      }
    } catch { /* The web demo has no native plugin host. */ }
  }
}

export function refreshPlugins() {
  if (!PLUGIN_RUNTIME_ENABLED) return Promise.resolve();
  dirty = true;
  reading ??= readPending().finally(() => {
    reading = undefined;
    if (dirty) void refreshPlugins();
  });
  return reading;
}

function subscribe(listener: () => void) {
  if (!PLUGIN_RUNTIME_ENABLED) return () => {};
  listeners.add(listener);
  if (listeners.size === 1) {
    const subscribed = ++generation;
    void onPluginsChanged(() => { void refreshPlugins(); }).then((stop) => {
      if (subscribed !== generation) { stop(); return; }
      unlisten = stop;
      void refreshPlugins();
    }).catch(() => { if (subscribed === generation) void refreshPlugins(); });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      generation += 1;
      unlisten?.();
      unlisten = undefined;
    }
  };
}

const getSnapshot = () => current;
export function usePlugins() { return useSyncExternalStore(subscribe, getSnapshot); }
