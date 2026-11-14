import type { IslandSettings } from "../../features/appearance/types";
import type { IslandMode } from "./types";

/** What the idle timer does when it runs out: collapse the open island, or tuck the collapsed one into a line. */
export type IdleAction = "tuck" | "collapse";
export type IdlePlan = { seconds: number; action: IdleAction };

type IdleSettings = Pick<IslandSettings, "autoTuck" | "tuckDelaySeconds" | "autoCollapseSeconds">;

/**
 * The idle timer for the island as it is now, or null when it has none. Two separate timers:
 * (A) the open island collapses `autoCollapseSeconds` after the cursor leaves it (it waits while
 * the cursor is on it); (B) the collapsed island tucks into a line after `tuckDelaySeconds`
 * without use, when tucking is on and no message preview shows. (A) never tucks by itself.
 */
export function idlePlan(
  mode: IslandMode,
  settings: IdleSettings,
  hasMessagePreview: boolean,
  isHovering = false,
  keepVisible = false,
): IdlePlan | null {
  if (mode === "expanded") {
    const seconds = settings.autoCollapseSeconds;
    if (seconds <= 0 || isHovering) return null;
    return { seconds, action: "collapse" };
  }
  if (!settings.autoTuck || hasMessagePreview || keepVisible) return null;
  return { seconds: settings.tuckDelaySeconds, action: "tuck" };
}
