import type { ExpandTrigger } from "../../features/appearance/types";

/**
 * Whether resting the cursor on an island tucked to the edge opens its panel in one step, or
 * only slides it out. It follows the expand trigger: in hover mode the tucked island opens
 * like one that never tucked; in click mode it only slides out and a click opens it. Game
 * mode (quiet) holds it back either way. The retired `tuckedHoverAction` setting is no longer
 * in Settings and always loads as "reveal", so it is not read here.
 */
export function tuckedHoverOpensPanel(expandTrigger: ExpandTrigger, quiet: boolean): boolean {
  return expandTrigger === "hover" && !quiet;
}
