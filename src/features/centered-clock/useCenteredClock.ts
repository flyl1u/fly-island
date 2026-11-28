import { useSyncExternalStore } from "react";
import { useNativePlugins } from "../plugins";
import { CENTERED_CLOCK_KEY, loadCenteredClockSettings, saveCenteredClockSettings } from "./storage.ts";
import type { CenteredClockSettings } from "./model.ts";

let current: CenteredClockSettings | null = null;
const listeners = new Set<() => void>();
const snapshot = () => current ??= loadCenteredClockSettings();
function reread() {
  const next = loadCenteredClockSettings();
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  current = next;
  listeners.forEach((listener) => listener());
}
function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === CENTERED_CLOCK_KEY) reread();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", reread);
    document.documentElement.addEventListener("pointerenter", reread);
    reread();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", reread);
      document.documentElement.removeEventListener("pointerenter", reread);
    }
  };
}

export function useCenteredClock() {
  const installed = useNativePlugins().centeredClock;
  const settings = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { installed, settings };
}

export function setCenteredClockSettings(settings: CenteredClockSettings) {
  saveCenteredClockSettings(settings);
  reread();
}
