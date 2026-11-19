import type { IslandSettings } from "./types";

/**
 * Gap between the top of the work area and a capsule island, in logical px. Rust takes it as the
 * window's vertical margin (clamped there to 0..160), so tucks still slide to the screen edge.
 */
export const CAPSULE_TOP_GAP = 8;

/**
 * The settings as the island draws them. The notch keeps the user's own values (and the same
 * object). The capsule floats a little below the top edge, a full pill while collapsed: its
 * collapsed corner radius is half the bar's height, which Rust also uses to round the hit area.
 */
export function shapedSettings(settings: IslandSettings): IslandSettings {
  if (settings.islandShape !== "capsule") return settings;
  return {
    ...settings,
    marginY: Math.max(settings.marginY, CAPSULE_TOP_GAP),
    collapsedCornerRadius: settings.collapsedHeight / 2,
  };
}
