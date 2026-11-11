import type { IslandSettings } from "../../features/appearance/types";
import type { IslandMode } from "./types";

/** What the idle timer does when it runs out: tuck the island to the top edge, or only collapse it. */
export type IdleAction = "tuck" | "collapse";
export type IdlePlan = { seconds: number; action: IdleAction };

type IdleSettings = Pick<IslandSettings, "autoTuck" | "autoTuckSeconds" | "autoCollapseSeconds">;

/**
 * The idle timer for the island as it is now, or null when it has none. An open panel closes
 * after the auto-collapse delay (General → "Collapse after"); when that is at least the tuck
 * delay it tucks at once, as it always did, otherwise it only collapses and the collapsed island
 * then tucks after the tuck delay. A collapsed island waits while a message preview shows.
 */
export function idlePlan(mode: IslandMode, settings: IdleSettings, hasMessagePreview: boolean): IdlePlan | null {
  if (mode === "expanded") {
    const seconds = settings.autoCollapseSeconds;
    if (seconds <= 0) return null;
    return { seconds, action: settings.autoTuck && seconds >= settings.autoTuckSeconds ? "tuck" : "collapse" };
  }
  if (!settings.autoTuck || hasMessagePreview) return null;
  return { seconds: settings.autoTuckSeconds, action: "tuck" };
}
