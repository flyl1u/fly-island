import { useMemo } from "react";
import {
  AGENT_ICON_PET_HEIGHT,
  CENTER_PATTERN_PLUGIN_ID,
  CENTER_PATTERN_WIDTH,
  CENTER_PET_WIDTH,
  CollapsedCenter,
  PetSprite,
  centerPatternChoice,
  usePageHidden,
  usePetMood,
  usePetSheet,
  type AgentActivity,
} from "../../features/center-pattern";
import { useBuiltinPlugin } from "../../features/plugins/useBuiltinPlugin";
import type { CollapsedSlots } from "./types";

const EMPTY: CollapsedSlots = {};

/**
 * The one place built-in plugins plug into the collapsed bar. Each plugin reads its own state
 * with useBuiltinPlugin(id) and fills a slot only while it is on, for example:
 *
 *   const usage = useBuiltinPlugin("focusd.usage-ring");
 *   return useMemo(() => usage.enabled
 *     ? { gauges: <UsageRing settings={usage.settings} />, sideWidth: 20 + 6 }
 *     : EMPTY, [usage]);
 *
 * Slots left empty change nothing on the bar. Keep the result stable (useMemo): the collapsed
 * width is worked out from it.
 */
export function useCollapsedSlots({ paused, agents }: { paused: boolean; agents: readonly AgentActivity[] }): CollapsedSlots {
  const center = useBuiltinPlugin(CENTER_PATTERN_PLUGIN_ID);
  const mood = usePetMood(agents, center.enabled);
  const choice = useMemo(() => centerPatternChoice(center.settings), [center.settings]);
  // Read here, not in the slot, so the pet is ready whenever the slot or the title shows it.
  const sheet = usePetSheet(center.enabled ? choice.petId : null, center);
  // A tray-hidden window keeps running; stop the animations there too.
  const hidden = usePageHidden();
  const still = paused || hidden;
  return useMemo(() => {
    if (!center.enabled) return EMPTY;
    const pet = typeof sheet === "string" ? sheet : null;
    return {
      center: <CollapsedCenter choice={choice} sheet={sheet} mood={mood} paused={still} />,
      centerWidth: pet ? CENTER_PET_WIDTH : CENTER_PATTERN_WIDTH,
      // While the bar names an agent the center is hidden, so the pet stands in for its icon.
      agentIcon: pet ? <PetSprite src={pet} mood={mood} paused={still} height={AGENT_ICON_PET_HEIGHT} /> : undefined,
    };
  }, [center.enabled, choice, sheet, mood, still]);
}
