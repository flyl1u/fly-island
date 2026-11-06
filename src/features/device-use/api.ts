import { invoke } from "@tauri-apps/api/core";

export type DeviceKind = "camera" | "microphone";

/** Mirrors DeviceUse in src-tauri/src/device_use/mod.rs: apps using each device now, sorted. */
export type DeviceUse = Record<DeviceKind, string[]>;

export function getDeviceUse() {
  return invoke<DeviceUse>("get_device_use");
}

/** Opens Windows' privacy settings for the device. */
export function openDevicePrivacySettings(device: DeviceKind) {
  return invoke<void>("open_device_privacy_settings", { device });
}
