import {
  DEFAULT_TRANSLATION_PROVIDER,
  LEGACY_TRANSLATION_PROVIDER,
  isTranslationProvider,
  type TranslationProvider,
} from "./providers.ts";

export type Direction = "auto" | "zh-en" | "en-zh";
export type TranslationSettings = {
  shortcut: string;
  /** Copies the current selection, translates it, then restores the clipboard. */
  selectionShortcut: string;
  direction: Direction;
  provider: TranslationProvider;
  /** Base URL of the OpenAI-compatible service used by the "custom" provider. */
  customBaseUrl: string;
  /** Model per provider; an empty or missing entry uses the provider's default. */
  models: Partial<Record<TranslationProvider, string>>;
  /** Fill an empty source from the clipboard when the translation window opens. */
  pasteClipboardOnOpen: boolean;
  /** Translate after the source has stopped changing, while the window is open. */
  autoTranslate: boolean;
};
export const STORAGE_KEY = "focusd-island-translation-settings";
const HANDOFF_KEY = "focusd-island-translation-handoff";
const LEGACY_DEFAULT_SHORTCUTS = new Set(["Alt+Space", "Alt+C"]);
const DEFAULT_SELECTION_SHORTCUT = "Ctrl+Alt+T";
const HANDOFF_OPEN_MS = 5_000;
const HANDOFF_MAX_AGE_MS = 60_000;

export const DEFAULT_SETTINGS: TranslationSettings = {
  shortcut: "Ctrl+Shift+F",
  selectionShortcut: DEFAULT_SELECTION_SHORTCUT,
  direction: "auto",
  provider: DEFAULT_TRANSLATION_PROVIDER,
  customBaseUrl: "",
  models: {},
  pasteClipboardOnOpen: true,
  autoTranslate: false,
};

type TranslationHandoff = {
  source: string;
  output: string;
  requestedAt: number;
  openRequestedAt: number | null;
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
  if (typeof stored !== "object" || stored === null) return DEFAULT_SETTINGS;
  const value = stored as Record<string, unknown>;
  const shortcut = typeof value.shortcut === "string" ? value.shortcut : DEFAULT_SETTINGS.shortcut;
  return {
    // Earlier defaults move to the current one; a shortcut the user picked is kept.
    shortcut: LEGACY_DEFAULT_SHORTCUTS.has(shortcut) ? DEFAULT_SETTINGS.shortcut : shortcut,
    direction: value.direction === "zh-en" || value.direction === "en-zh" ? value.direction : "auto",
    provider: isTranslationProvider(value.provider) ? value.provider : LEGACY_TRANSLATION_PROVIDER,
    customBaseUrl: typeof value.customBaseUrl === "string" ? value.customBaseUrl : "",
    models: normalizeModels(value.models),
    selectionShortcut: typeof value.selectionShortcut === "string" && value.selectionShortcut
      ? value.selectionShortcut
      : DEFAULT_SELECTION_SHORTCUT,
    pasteClipboardOnOpen: value.pasteClipboardOnOpen !== false,
    autoTranslate: value.autoTranslate === true,
  };
}

function readHandoff(): TranslationHandoff | null {
  try {
    const value = JSON.parse(localStorage.getItem(HANDOFF_KEY) ?? "null") as Partial<TranslationHandoff> | null;
    if (!value || typeof value.source !== "string" || typeof value.output !== "string") return null;
    if (typeof value.requestedAt !== "number") return null;
    return {
      source: value.source,
      output: value.output,
      requestedAt: value.requestedAt,
      openRequestedAt: typeof value.openRequestedAt === "number" ? value.openRequestedAt : null,
    };
  } catch {
    return null;
  }
}

function writeHandoff(handoff: TranslationHandoff) {
  localStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
}

/** Remember a quick translation so the window can open onto it. */
export function saveTranslationHandoff(source: string, output: string) {
  writeHandoff({
    source,
    output,
    requestedAt: Date.now(),
    openRequestedAt: readHandoff()?.openRequestedAt ?? null,
  });
}

/** The next time the translation window opens, it should show the saved handoff. */
export function requestTranslationHandoffOpen() {
  const current = readHandoff();
  if (!current) return;
  writeHandoff({ ...current, openRequestedAt: Date.now() });
}

/** The handoff a fresh open request is waiting for, consumed so a later open stays blank. */
export function takeTranslationHandoff(now = Date.now()): { source: string; output: string } | null {
  const current = readHandoff();
  if (!current?.openRequestedAt) return null;
  const openAge = now - current.openRequestedAt;
  const age = now - current.requestedAt;
  if (openAge > HANDOFF_OPEN_MS || age > HANDOFF_MAX_AGE_MS || openAge < 0 || age < 0) return null;
  writeHandoff({ ...current, openRequestedAt: null });
  return { source: current.source, output: current.output };
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
