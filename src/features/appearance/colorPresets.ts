import { colorsFrom, normalizeColorPalette, sameColors, type ColorPalette } from "./colorPalette.ts";
import { HEX_COLOR_PATTERN } from "../../utils/color.ts";
import type { IslandSettings } from "./types";

type PresetPalette = ColorPalette & { pageTextColor?: string };
export type ColorPreset = PresetPalette & { id: string };
export const MAX_COLOR_PRESETS = 8;

function normalizePresetPalette(value: unknown): PresetPalette | null {
  const colors = normalizeColorPalette(value);
  if (!colors) return null;
  const pageTextColor = (value as Record<string, unknown>).pageTextColor;
  // Missing/corrupt optional fields retain the legacy behavior: leave the current page ink alone.
  return typeof pageTextColor === "string" && (pageTextColor === "" || HEX_COLOR_PATTERN.test(pageTextColor))
    ? { ...colors, pageTextColor: pageTextColor.toUpperCase() } : colors;
}

export function samePresetColors(left: PresetPalette, right: PresetPalette): boolean {
  return sameColors(left, right) && left.pageTextColor?.toUpperCase() === right.pageTextColor?.toUpperCase();
}

export function applyColorPreset(settings: IslandSettings, preset: ColorPreset): IslandSettings {
  return { ...settings, ...colorsFrom(preset), pageTextColor: preset.pageTextColor?.toUpperCase() ?? settings.pageTextColor };
}

export function normalizeColorPresets(value: unknown): ColorPreset[] {
  if (!Array.isArray(value)) return [];
  const presets: ColorPreset[] = [];
  for (const item of value as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const { id } = item as Record<string, unknown>;
    const colors = normalizePresetPalette(item);
    if (!colors || typeof id !== "string" || !id.trim()) continue;
    if (presets.some((preset) => preset.id === id || samePresetColors(preset, colors))) continue;
    presets.push({ id, ...colors });
    if (presets.length === MAX_COLOR_PRESETS) break;
  }
  return presets;
}

export function addColorPreset(presets: ColorPreset[], colors: PresetPalette, id: string): ColorPreset[] {
  const palette = normalizePresetPalette(colors);
  if (presets.length >= MAX_COLOR_PRESETS || !id.trim() || !palette
    || (colors.pageTextColor !== undefined && palette.pageTextColor === undefined)
    || presets.some((preset) => preset.id === id || samePresetColors(preset, palette))) return presets;
  return [...presets, { id, ...palette }];
}

export function removeColorPreset(presets: ColorPreset[], id: string): ColorPreset[] {
  return presets.filter((preset) => preset.id !== id);
}
