import { Channel, invoke } from "@tauri-apps/api/core";
import type { UpdateChannel } from "./storage";

export function isUpdaterConfigured() {
  return invoke<boolean>("updater_configured");
}

export function getUpdaterProxy() {
  return invoke<string | null>("get_updater_proxy");
}

/** Mirrors UpdateInfo in src-tauri/src/system/update_channel.rs. */
export type UpdateInfo = { version: string; body: string | null };

/** Mirrors DownloadEvent in src-tauri/src/system/update_channel.rs. */
export type DownloadEvent =
  | { event: "Started"; data: { contentLength: number | null } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

/** Checks the channel's manifest; the update found is kept natively for installUpdate. */
export function checkUpdate(channel: UpdateChannel, proxy: string | null) {
  return invoke<UpdateInfo | null>("updater_check", { channel, proxy });
}

/** Downloads and installs the update the last check found. */
export function downloadAndInstallUpdate(onEvent: (event: DownloadEvent) => void) {
  const channel = new Channel<DownloadEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("updater_install", { onEvent: channel });
}
