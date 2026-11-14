import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { loadSettings } from "../../features/appearance/storage";

export function openClipboardWindow() { return invoke<void>("open_clipboard_window"); }
export function showClipboardWindow() { return invoke<void>("show_clipboard_window"); }
export function closeClipboardWindow() { return invoke<void>("close_clipboard_window"); }
export function setClipboardWindowPinned(pinned: boolean) { return getCurrentWindow().setAlwaysOnTop(pinned); }
export function setClipboardWindowTitle(title: string) { return getCurrentWindow().setTitle(title); }
export function dragClipboardWindow() { return getCurrentWindow().startDragging(); }
export type ClipboardResizeDirection = Parameters<ReturnType<typeof getCurrentWindow>["startResizeDragging"]>[0];
export function resizeClipboardWindow(direction: ClipboardResizeDirection) { return getCurrentWindow().startResizeDragging(direction); }

/** Read the stored choice at activation time, including changes from the settings window. */
export function openDetachedClipboardHistory(): boolean {
  if (!loadSettings().clipboardDetached) return false;
  void openClipboardWindow().catch((error) => console.error("Failed to open clipboard window", error));
  return true;
}
