// Appearance theme files: one style preset as a file, to share or move to another computer.
// Pure; useSettingPresets saves the file and turns an imported one into a preset.

import { APPEARANCE_SETTING_KEYS, normalizeSettings, withAppearanceFrom } from "./settings.ts";
import type { IslandSettings } from "./types";

/** Longer names are cut; the preset list shows one line anyway. */
export const MAX_THEME_NAME_LENGTH = 60;

type AppearanceKey = (typeof APPEARANCE_SETTING_KEYS)[number];

export type ThemeFile = {
  app: "fly-island";
  kind: "theme";
  version: 1;
  name: string;
  exportedAt: string;
  appearance: Pick<IslandSettings, AppearanceKey>;
};

export type ThemeProblem = "notJson" | "notTheme" | "newerVersion";

/** The theme file of a preset: its name and appearance settings, nothing else. */
export function buildTheme(name: string, settings: IslandSettings, now: Date): ThemeFile {
  const appearance = Object.fromEntries(
    APPEARANCE_SETTING_KEYS.map((key) => [key, settings[key]]),
  ) as ThemeFile["appearance"];
  return { app: "fly-island", kind: "theme", version: 1, name, exportedAt: now.toISOString(), appearance };
}

/** "fly-island-theme-2026-11-08-1430.json", in local time; the preset's name is inside. */
export function themeFileName(now: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `fly-island-theme-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

/**
 * The name and settings of a theme file's text, or why it cannot be imported. Only appearance
 * fields are read, over `current`, and every value goes through normalizeSettings, so a file
 * edited by hand cannot carry anything the appearance page would not allow.
 */
export function parseTheme(
  text: string,
  current: IslandSettings,
): { name: string; settings: IslandSettings } | { problem: ThemeProblem } {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { problem: "notJson" };
  }
  if (typeof value !== "object" || value === null) return { problem: "notTheme" };
  const file = value as Record<string, unknown>;
  if (file.app !== "fly-island" || file.kind !== "theme" || typeof file.appearance !== "object" || file.appearance === null) {
    return { problem: "notTheme" };
  }
  if (typeof file.version !== "number" || file.version > 1) return { problem: "newerVersion" };
  const source = file.appearance as Record<string, unknown>;
  const picked = Object.fromEntries(
    APPEARANCE_SETTING_KEYS.filter((key) => key in source).map((key) => [key, source[key]]),
  );
  const settings = withAppearanceFrom(current, normalizeSettings({ ...current, ...picked }));
  const name = typeof file.name === "string" ? file.name.trim().slice(0, MAX_THEME_NAME_LENGTH) : "";
  return { name, settings };
}
