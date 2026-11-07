import { invoke } from "@tauri-apps/api/core";

// Mirrors the commands in src-tauri/src/phone_push/mod.rs (roadmap B6.5.5).

export function hasBarkKey() {
  return invoke<boolean>("has_bark_key");
}

/** Takes the bare key or the push URL the Bark app shows; kept in Windows Credential Manager. */
export function saveBarkKey(key: string) {
  return invoke<void>("save_bark_key", { key });
}

export function deleteBarkKey() {
  return invoke<void>("delete_bark_key");
}

/** `server` empty means Bark's own server. */
export function sendBarkPush(server: string, title: string, body: string, group: string) {
  return invoke<void>("send_bark_push", { server, title, body, group });
}

/** Seconds since the last keyboard or mouse input; null when Windows cannot say. */
export function getUserIdleSeconds() {
  return invoke<number | null>("get_user_idle_seconds");
}
