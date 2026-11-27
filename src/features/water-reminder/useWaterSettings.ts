import { useSyncExternalStore } from "react";
import { loadWaterReminder, saveWaterReminder, WATER_REMINDER_KEY, type WaterReminderSettings } from "./storage";

let current: WaterReminderSettings | undefined;
const listeners = new Set<() => void>();
const snapshot = () => current ??= loadWaterReminder();

function reload() {
  const next = loadWaterReminder();
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === WATER_REMINDER_KEY) reload();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", reload);
    reload();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", reload);
    }
  };
}

export const useWaterSettings = () => useSyncExternalStore(subscribe, snapshot, snapshot);

export function updateWaterSettings(update: Partial<WaterReminderSettings>) {
  const saved = saveWaterReminder(update);
  reload();
  return saved;
}
