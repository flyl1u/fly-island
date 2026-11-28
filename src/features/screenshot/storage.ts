import { readJson, writeJson } from "../../lib/storage.ts";

export const SCREENSHOT_SETTINGS_KEY = "fly-island-screenshot-settings";
export type ScreenshotSettings = {
  shortcutIssue: { shortcut: string; reason: string } | null;
  shortcut: string; shortcutEnabled: boolean; showMagnifier: boolean; windowSnapping: boolean; showHints: boolean;
};
export const DEFAULT_SCREENSHOT_SETTINGS: ScreenshotSettings = {
  shortcutIssue: null, shortcut: "Alt+A", shortcutEnabled: true, showMagnifier: true, windowSnapping: true, showHints: true,
};
export function normalizeScreenshotSettings(value: unknown): ScreenshotSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const defaults = DEFAULT_SCREENSHOT_SETTINGS;
  const issue = raw.shortcutIssue as Record<string, unknown> | null;
  return {
    shortcutIssue: issue && typeof issue.shortcut === "string" && typeof issue.reason === "string"
      ? { shortcut: issue.shortcut.slice(0, 80), reason: issue.reason.slice(0, 512) } : null,
    shortcut: typeof raw.shortcut === "string" && raw.shortcut.trim() && raw.shortcut.length <= 80 ? raw.shortcut.trim() : defaults.shortcut,
    shortcutEnabled: typeof raw.shortcutEnabled === "boolean" ? raw.shortcutEnabled : defaults.shortcutEnabled,
    showMagnifier: typeof raw.showMagnifier === "boolean" ? raw.showMagnifier : defaults.showMagnifier,
    windowSnapping: typeof raw.windowSnapping === "boolean" ? raw.windowSnapping : defaults.windowSnapping,
    showHints: typeof raw.showHints === "boolean" ? raw.showHints : defaults.showHints,
  };
}
export const loadScreenshotSettings = () => normalizeScreenshotSettings(readJson(SCREENSHOT_SETTINGS_KEY));
export const saveScreenshotSettings = (settings: ScreenshotSettings) => writeJson(SCREENSHOT_SETTINGS_KEY, normalizeScreenshotSettings(settings));
