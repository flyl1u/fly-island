import { useSyncExternalStore } from "react";
import { loadScreenshotSettings, saveScreenshotSettings, SCREENSHOT_SETTINGS_KEY, type ScreenshotSettings } from "./storage";

let current: ScreenshotSettings | null = null;
const listeners = new Set<() => void>();
const snapshot = () => current ??= loadScreenshotSettings();
function refresh() {
  const next = loadScreenshotSettings();
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next; listeners.forEach((listener) => listener());
}
function onStorage(event: StorageEvent) { if (!event.key || event.key === SCREENSHOT_SETTINGS_KEY) refresh(); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) { window.addEventListener("storage", onStorage); window.addEventListener("focus", refresh); refresh(); }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { window.removeEventListener("storage", onStorage); window.removeEventListener("focus", refresh); }
  };
}
export function updateScreenshotSettings(patch: Partial<ScreenshotSettings>): boolean {
  const saved = saveScreenshotSettings({ ...loadScreenshotSettings(), ...patch });
  if (saved) refresh();
  return saved;
}
export function useScreenshotSettings() { return useSyncExternalStore(subscribe, snapshot, snapshot); }
