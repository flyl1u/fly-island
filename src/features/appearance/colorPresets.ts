import { colorsFrom, normalizeColorPalette, sameColors, type ColorPalette } from "./colorPalette.ts";

export type ColorPreset = ColorPalette & { id: string };
export const MAX_COLOR_PRESETS = 8;

export function normalizeColorPresets(value: unknown): ColorPreset[] {
  if (!Array.isArray(value)) return [];
  const presets: ColorPreset[] = [];
  for (const item of value as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const { id } = item as Record<string, unknown>;
    const colors = normalizeColorPalette(item);
    if (!colors || typeof id !== "string" || !id.trim()) continue;
    if (presets.some((preset) => preset.id === id || sameColors(preset, colors))) continue;
    presets.push({ id, ...colors });
    if (presets.length === MAX_COLOR_PRESETS) break;
  }
  return presets;
}

export function addColorPreset(presets: ColorPreset[], colors: ColorPalette, id: string): ColorPreset[] {
  if (presets.length >= MAX_COLOR_PRESETS || !id.trim() || !normalizeColorPalette(colors)
    || presets.some((preset) => preset.id === id || sameColors(preset, colors))) return presets;
  return [...presets, { id, ...colorsFrom(colors) }];
}

export function removeColorPreset(presets: ColorPreset[], id: string): ColorPreset[] {
  return presets.filter((preset) => preset.id !== id);
}
