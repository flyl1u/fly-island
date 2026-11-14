import { readString, writeString } from "../../lib/storage.ts";

export const CLIPBOARD_WINDOW_PINNED_KEY = "focusd-island-clipboard-window-pinned";

/** Missing, malformed and unavailable storage all keep the default: pinned. */
export function loadClipboardWindowPinned(): boolean {
  return readString(CLIPBOARD_WINDOW_PINNED_KEY) !== "false";
}

export function saveClipboardWindowPinned(pinned: boolean): boolean {
  return writeString(CLIPBOARD_WINDOW_PINNED_KEY, String(pinned));
}
