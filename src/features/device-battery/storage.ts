import { useSyncExternalStore } from "react";
import { readString, writeJson } from "../../lib/storage.ts";
import { DEFAULT_DEVICE_BATTERY, normalizeDeviceBatterySettings, type DeviceBatterySettings } from "./model.ts";

export const DEVICE_BATTERY_KEY = "focusd-island-device-battery";
const CHANGE = "fly-island-device-battery-settings";
let raw: string | null | undefined;
let cached = DEFAULT_DEVICE_BATTERY;
function snapshot() {
  const next = readString(DEVICE_BATTERY_KEY);
  if (next !== raw) {
    raw = next;
    try { cached = normalizeDeviceBatterySettings(next ? JSON.parse(next) : null); }
    catch { cached = DEFAULT_DEVICE_BATTERY; }
  }
  return cached;
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === DEVICE_BATTERY_KEY) listener(); };
  window.addEventListener("storage", storage);
  window.addEventListener(CHANGE, listener);
  window.addEventListener("focus", listener);
  document.documentElement.addEventListener("pointerenter", listener);
  return () => {
    window.removeEventListener("storage", storage); window.removeEventListener(CHANGE, listener);
    window.removeEventListener("focus", listener); document.documentElement.removeEventListener("pointerenter", listener);
  };
}
export function useDeviceBatterySettings() { return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_DEVICE_BATTERY); }
export function saveDeviceBatterySettings(settings: DeviceBatterySettings) {
  if (!writeJson(DEVICE_BATTERY_KEY, normalizeDeviceBatterySettings(settings))) return false;
  window.dispatchEvent(new Event(CHANGE));
  return true;
}
