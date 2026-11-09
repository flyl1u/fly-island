import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import type { TranslationProvider } from "./providers";
import type { Direction } from "./storage";

// 与 translation/mod.rs 中推送的事件名一致。
export const TRANSLATION_WINDOW_OPENED_EVENT = "translation-window-opened";
export const TRANSLATION_ISLAND_SHORTCUT_EVENT = "translation-island-shortcut";

/** Service, base URL (custom provider only) and model for a translation request. */
export type TranslationService = {
  provider: TranslationProvider;
  baseUrl: string | null;
  model: string | null;
};

export function hasTranslationSecret(provider: TranslationProvider) {
  return invoke<boolean>("has_translation_secret", { provider });
}

/** Off unregisters the global shortcut; on lets set_translation_shortcut register it again. */
export function setTranslationEnabled(enabled: boolean) {
  return invoke("set_translation_enabled", { enabled });
}

/** True sends the window shortcut to the island page instead of the translation window. */
export function setTranslationTarget(island: boolean) {
  return invoke("set_translation_target", { island });
}

export function setTranslationShortcut(shortcut: string) {
  return invoke<string>("set_translation_shortcut", { shortcut });
}

export function readTranslationClipboard() {
  return invoke<string | null>("read_translation_clipboard");
}

export function translateText(text: string, direction: Direction, service: TranslationService) {
  return invoke<string>("translate_text", { text, direction, ...service });
}

export function saveTranslationSecret(secret: string, provider: TranslationProvider) {
  return invoke("save_translation_secret", { secret, provider });
}

export function deleteTranslationSecret(provider: TranslationProvider) {
  return invoke("delete_translation_secret", { provider });
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

/** Shows the translation window without hiding it when it is already open. */
export function listenTranslationIslandShortcut(handler: EventCallback<unknown>) {
  return listen(TRANSLATION_ISLAND_SHORTCUT_EVENT, handler);
}
