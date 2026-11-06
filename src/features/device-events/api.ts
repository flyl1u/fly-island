import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Mirrors AudioKind in src-tauri/src/device_events/tracker.rs. */
export type AudioDeviceKind = "headphones" | "headset" | "speaker";

/** Mirrors DeviceAlert in src-tauri/src/device_events/tracker.rs; `battery` is a percentage. */
export type DeviceAlert =
  | { kind: "audioConnected"; name: string; device: AudioDeviceKind; battery: number | null }
  | { kind: "audioDisconnected"; name: string; device: AudioDeviceKind }
  | { kind: "batteryLow"; name: string; battery: number }
  | { kind: "powerConnected"; battery: number | null }
  | { kind: "powerDisconnected"; battery: number | null };

/** Starts or stops the native watcher; it reads nothing while stopped. */
export function setDeviceAlertsEnabled(enabled: boolean) {
  return invoke<void>("set_device_alerts_enabled", { enabled });
}

/** Calls `onAlert` for each device alert; resolves to the unlisten function. */
export function listenDeviceAlerts(onAlert: (alert: DeviceAlert) => void) {
  return listen<DeviceAlert>("device-alert", (event) => onAlert(event.payload));
}
