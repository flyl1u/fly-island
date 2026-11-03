import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import type { Direction } from "./storage";

// 与 translation.rs 中推送的事件名一致。
export const TRANSLATION_WINDOW_OPENED_EVENT = "translation-window-opened";

export function hasTranslationSecret() {
  return invoke<boolean>("has_translation_secret");
}

export function setTranslationShortcut(shortcut: string) {
  return invoke<string>("set_translation_shortcut", { shortcut });
}

export function readTranslationClipboard() {
  return invoke<string | null>("read_translation_clipboard");
}

export function translateText(text: string, direction: Direction) {
  return invoke<string>("translate_text", { text, direction });
}

export function saveTranslationSecret(secret: string) {
  return invoke("save_translation_secret", { secret });
}

export function deleteTranslationSecret() {
  return invoke("delete_translation_secret");
}

export function copyTranslationResult(text: string) {
  return invoke("copy_translation_result", { text });
}

export function hideTranslationWindow() {
  return invoke("hide_translation_window");
}

export function listenTranslationWindowOpened(handler: EventCallback<unknown>) {
  return listen(TRANSLATION_WINDOW_OPENED_EVENT, handler);
}

export function toggleTranslationWindow() {
  return invoke("toggle_translation_window");
}
