import { DEFAULT_TRANSLATION_PROVIDER, isTranslationProvider, type TranslationProvider } from "./providers.ts";

export type Direction = "auto" | "zh-en" | "en-zh";
export type TranslationSettings = {
  shortcut: string;
  direction: Direction;
  provider: TranslationProvider;
  /** Base URL of the OpenAI-compatible service used by the "custom" provider. */
  customBaseUrl: string;
  /** Model per provider; an empty or missing entry uses the provider's default. */
  models: Partial<Record<TranslationProvider, string>>;
};
export const STORAGE_KEY = "focusd-island-translation-settings";
const LEGACY_DEFAULT_SHORTCUTS = new Set(["Alt+Space", "Alt+C"]);
export const DEFAULT_SETTINGS: TranslationSettings = {
  shortcut: "Ctrl+Shift+F",
  direction: "auto",
  provider: DEFAULT_TRANSLATION_PROVIDER,
  customBaseUrl: "",
  models: {},
};

function normalizeModels(value: unknown): TranslationSettings["models"] {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [TranslationProvider, string] =>
        isTranslationProvider(entry[0]) && typeof entry[1] === "string",
    ),
  );
}

export function normalizeTranslationSettings(stored: unknown): TranslationSettings {
  const value = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, unknown>;
  const shortcut = typeof value.shortcut === "string" ? value.shortcut : DEFAULT_SETTINGS.shortcut;
  return {
    // Earlier defaults move to the current one; a shortcut the user picked is kept.
    shortcut: LEGACY_DEFAULT_SHORTCUTS.has(shortcut) ? DEFAULT_SETTINGS.shortcut : shortcut,
    direction: value.direction === "zh-en" || value.direction === "en-zh" ? value.direction : "auto",
    provider: isTranslationProvider(value.provider) ? value.provider : DEFAULT_TRANSLATION_PROVIDER,
    customBaseUrl: typeof value.customBaseUrl === "string" ? value.customBaseUrl : "",
    models: normalizeModels(value.models),
  };
}

export function loadSettings(): TranslationSettings {
  try {
    return normalizeTranslationSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveTranslationSettings(settings: TranslationSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
