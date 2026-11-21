import { useSyncExternalStore } from "react";
import { useNativePlugins } from "../plugins";
import { CLOCK_WEATHER_KEY, loadClockWeatherSettings, saveClockWeatherSettings, type ClockWeatherSettingsUpdate } from "./storage";
import type { ClockWeatherSettings } from "./model";

let current: ClockWeatherSettings | null = null;
const listeners = new Set<() => void>();
const snapshot = () => current ??= loadClockWeatherSettings();
function reread() {
  const next = loadClockWeatherSettings();
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  current = next;
  listeners.forEach((listener) => listener());
}
function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === CLOCK_WEATHER_KEY) reread();
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
export function useClockWeather() {
  const installed = useNativePlugins().clockWeather;
  const settings = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { installed, settings };
}
export function setClockWeatherSettings(update: ClockWeatherSettingsUpdate) {
  const saved = saveClockWeatherSettings(update);
  reread();
  return saved;
}
