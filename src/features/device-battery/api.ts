import { Channel, invoke } from "@tauri-apps/api/core";
import { normalizeAudio, normalizeBatteries, type AudioSnapshot, type BatterySnapshot, type DeviceBatterySettings } from "./model";

const audioRequests = new Map<string, Promise<AudioSnapshot>>();
type BatteryListener = (value: BatterySnapshot) => void;
let batteryRequest: {
  result: Promise<BatterySnapshot>;
  latest: BatterySnapshot | null;
  listeners: Set<BatteryListener>;
} | null = null;

// Rust: device_battery/mod.rs; underlying helper types: AudioReading and battery schema 2.
export function readDeviceAudio(settings: DeviceBatterySettings, target: "speaker" | "headset" | null = null) {
  const key = JSON.stringify([settings.speakerId, settings.headsetId, target]);
  const current = audioRequests.get(key);
  if (current) return current;
  const request = invoke<unknown>("device_battery_audio", {
    speakerId: settings.speakerId, headsetId: settings.headsetId, target,
  }).then(normalizeAudio).finally(() => audioRequests.delete(key));
  audioRequests.set(key, request);
  return request;
}
export async function readDeviceBatteries(onProgress: BatteryListener = () => {}) {
  let request = batteryRequest;
  if (!request) {
    const listeners = new Set<BatteryListener>();
    const progress = new Channel<unknown>();
    const pending = {
      latest: null as BatterySnapshot | null,
      listeners,
      result: invoke<unknown>("device_battery_read", { progress }).then(normalizeBatteries)
        .finally(() => { batteryRequest = null; }),
    };
    progress.onmessage = (value) => {
      pending.latest = normalizeBatteries(value);
      for (const listener of listeners) listener(pending.latest);
    };
    request = pending;
    batteryRequest = request;
  }
  request.listeners.add(onProgress);
  try {
    if (request.latest) onProgress(request.latest);
    const result = await request.result;
    // A reader crash after progress must not discard the readings it already sent.
    return result.errors.length && request.latest && !result.devices.length
      ? { ...result, devices: request.latest.devices }
      : result;
  } finally {
    request.listeners.delete(onProgress);
  }
}
