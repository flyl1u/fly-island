import { readString, writeString } from "../../lib/storage.ts";
export type Direction = "auto" | "zh-en" | "en-zh";
export type TranslationSettings = { shortcut: string; direction: Direction };
export const STORAGE_KEY = "focusd-island-translation-settings";
export const DEFAULT_SETTINGS: TranslationSettings = { shortcut: "Alt+C", direction: "auto" };

export function loadSettings(): TranslationSettings {
  try {
    const stored = JSON.parse(readString(STORAGE_KEY) ?? "null") as Partial<TranslationSettings> | null;
    const shortcut = typeof stored?.shortcut === "string" ? stored.shortcut : DEFAULT_SETTINGS.shortcut;
    return {
      shortcut: shortcut === "Alt+Space" ? DEFAULT_SETTINGS.shortcut : shortcut,
      direction: stored?.direction === "zh-en" || stored?.direction === "en-zh" ? stored.direction : "auto",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveTranslationSettings(settings: TranslationSettings) {
  writeString(STORAGE_KEY, JSON.stringify(settings));
}
