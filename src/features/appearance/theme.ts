// The colour scheme (Appearance → Style): which scheme is drawn, and the island's three colours in it.
import { inkOn } from "../../utils/color.ts";
import type { ColorPalette } from "./colorPalette.ts";
import type { ColorScheme } from "./types";

/** A scheme actually drawn: "system" resolves to one of these. */
export type ResolvedScheme = "dark" | "light";

export const COLOR_SCHEMES = ["dark", "light", "system"] as const satisfies readonly ColorScheme[];

/**
 * Each scheme's island colours. A colour the user never changed (it equals one of these) follows
 * the scheme; one they picked stays theirs in every scheme. Dark is the island's original palette.
 */
export const SCHEME_COLORS: Record<ResolvedScheme, ColorPalette> = {
  dark: { islandBackgroundColor: "#2F2F37", taskTextColor: "#FFFFFF", pulseColor: "#3AE489" },
  light: { islandBackgroundColor: "#F4F4F7", taskTextColor: "#1C1C22", pulseColor: "#12A155" },
};

export function resolveColorScheme(scheme: ColorScheme, systemIsDark: boolean): ResolvedScheme {
  if (scheme === "system") return systemIsDark ? "dark" : "light";
  return scheme;
}

/** Whether a saved colour is one of the schemes' own, so it follows the scheme. */
export function followsScheme(key: keyof ColorPalette, value: string) {
  return Object.values(SCHEME_COLORS).some((colors) => colors[key].toUpperCase() === value.toUpperCase());
}

/** The tone of what sits on a background: light text on a dark island, or dark text on a light one. */
export function toneOn(background: string): ResolvedScheme {
  return inkOn(background) === inkOn("#000000") ? "dark" : "light";
}

/**
 * The colours drawn in `scheme`. The background follows the scheme unless the user picked one;
 * the text and the status light follow the background's tone, so a white island picked in the dark
 * scheme still gets dark, readable text.
 */
export function resolveSchemeColors(settings: ColorPalette, scheme: ResolvedScheme): ColorPalette & { tone: ResolvedScheme } {
  const islandBackgroundColor = followsScheme("islandBackgroundColor", settings.islandBackgroundColor)
    ? SCHEME_COLORS[scheme].islandBackgroundColor
    : settings.islandBackgroundColor;
  const tone = toneOn(islandBackgroundColor);
  const pick = (key: "taskTextColor" | "pulseColor") =>
    followsScheme(key, settings[key]) ? SCHEME_COLORS[tone][key] : settings[key];
  return { islandBackgroundColor, taskTextColor: pick("taskTextColor"), pulseColor: pick("pulseColor"), tone };
}
