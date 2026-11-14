import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// 与 src-tauri/src/clipboard_history/mod.rs 中的同名结构对应。
export type ClipboardHistorySettings = {
  enabled: boolean;
  captureImages: boolean;
  maxItems: number;
  shortcut: string;
  shortcutEnabled: boolean;
};

export type ClipboardHistoryImage = {
  width: number;
  height: number;
  byteSize: number;
  originalPath: string;
  thumbnailPath: string;
  thumbnailDataUrl?: string;
};

export type ClipboardHistoryItem = {
  id: string;
  kind: "text" | "image";
  hash: string;
  createdAt: number;
  copiedAt: number;
  favorite?: boolean;
  note?: string;
  preview: string;
  text?: string;
  image?: ClipboardHistoryImage;
};

export type ClipboardHistorySnapshot = {
  settings: ClipboardHistorySettings;
  items: ClipboardHistoryItem[];
};

// 与 clipboard_history/mod.rs 中的 HISTORY_CHANGED_EVENT、clipboard_history/hotkey.rs 中的 HOTKEY_EVENT 一致。
export const CLIPBOARD_HISTORY_CHANGED_EVENT = "clipboard-history-changed";
export const CLIPBOARD_HISTORY_SHORTCUT_EVENT = "clipboard-history-shortcut";
// 与 clipboard_history/hotkey.rs 中的 HOTKEY_STATUS_EVENT 一致；载荷为注册错误，成功或关闭时为 null。
export const CLIPBOARD_SHORTCUT_STATUS_EVENT = "clipboard-history-shortcut-status";

export function getClipboardHistory() {
  return invoke<ClipboardHistorySnapshot>("get_clipboard_history");
}

export function getClipboardShortcutError() {
  return invoke<string | null>("get_clipboard_shortcut_error");
}

export function setClipboardHistorySettings(settings: ClipboardHistorySettings) {
  return invoke<ClipboardHistorySnapshot>("set_clipboard_history_settings", { settings });
}

export function copyClipboardItem(id: string) {
  return invoke<ClipboardHistorySnapshot>("copy_clipboard_history_item", { id });
}

export function toggleClipboardFavorite(id: string) {
  return invoke<ClipboardHistorySnapshot>("toggle_clipboard_history_favorite", { id });
}

export function setClipboardItemNote(id: string, note: string) {
  return invoke<ClipboardHistorySnapshot>("set_clipboard_history_item_note", { id, note });
}

export function deleteClipboardItem(id: string) {
  return invoke<ClipboardHistorySnapshot>("delete_clipboard_history_item", { id });
}

export function deleteClipboardItems(ids: string[]) {
  return invoke<ClipboardHistorySnapshot>("delete_clipboard_history_items", { ids });
}

export function readClipboardImage(id: string) {
  return invoke<string>("read_clipboard_history_image", { id });
}

/** The main frontend calls this only when a shortcut is routed to the island. */
export function showClipboardHistoryIsland() {
  return invoke<void>("show_clipboard_history_island");
}

export function clearClipboardHistory() {
  return invoke<ClipboardHistorySnapshot>("clear_clipboard_history");
}

/** 返回取消订阅函数的 Promise；调用方负责在卸载时取消。 */
export function listenClipboardHistoryChanged(handler: () => void) {
  return listen(CLIPBOARD_HISTORY_CHANGED_EVENT, handler);
}

export function listenClipboardHistoryShortcut(handler: () => void) {
  return listen(CLIPBOARD_HISTORY_SHORTCUT_EVENT, handler);
}

export function listenClipboardShortcutStatus(handler: (error: string | null) => void) {
  return listen<string | null>(CLIPBOARD_SHORTCUT_STATUS_EVENT, (event) => handler(event.payload));
}
