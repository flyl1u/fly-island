import { HEX_COLOR_PATTERN } from "../../utils/color.ts";
import type { IslandSettings } from "./types";

export type ColorPalette = Pick<IslandSettings, "islandBackgroundColor" | "taskTextColor" | "pulseColor">;
export const COLOR_KEYS = ["islandBackgroundColor", "taskTextColor", "pulseColor"] as const;

export function colorsFrom(settings: ColorPalette): ColorPalette {
  return {
    islandBackgroundColor: settings.islandBackgroundColor.toUpperCase(),
    taskTextColor: settings.taskTextColor.toUpperCase(),
    pulseColor: settings.pulseColor.toUpperCase(),
  };
}

/** Stored palettes accept only complete six-digit colors; corrupt records are empty. */
export function normalizeColorPalette(value: unknown): ColorPalette | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!COLOR_KEYS.every((key) => typeof record[key] === "string" && HEX_COLOR_PATTERN.test(record[key]))) return null;
  return colorsFrom(record as ColorPalette);
}

export function sameColors(left: ColorPalette, right: ColorPalette): boolean {
  return COLOR_KEYS.every((key) => left[key].toUpperCase() === right[key].toUpperCase());
}
