import { clamp } from "../../utils/number.ts";
import type { ClipboardHistorySettings, ClipboardHistorySnapshot } from "./api";
import { DEFAULT_CLIPBOARD_SHORTCUT, normalizeClipboardShortcut } from "./shortcut.ts";

export const DEFAULT_CLIPBOARD_HISTORY: ClipboardHistorySnapshot = {
  settings: {
    enabled: true,
    captureImages: true,
    maxItems: 30,
    shortcut: DEFAULT_CLIPBOARD_SHORTCUT,
    shortcutEnabled: true,
  },
  items: [],
};

export function normalizeClipboardSettings(
  settings: ClipboardHistorySettings,
): ClipboardHistorySettings {
  return {
    ...settings,
    maxItems: clamp(Number.isFinite(settings.maxItems) ? Math.round(settings.maxItems) : 30, 5, 500),
    shortcut: normalizeClipboardShortcut(settings.shortcut),
    shortcutEnabled: settings.shortcutEnabled !== false,
  };
}
