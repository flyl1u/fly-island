import { useEffect, useMemo, useState } from "react";
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
import { ClaudeUsageGauge } from "../../features/claude-usage/ClaudeUsageGauge";
import { CLAUDE_USAGE_GAUGE_WIDTH } from "../../features/claude-usage/usageRing";
import { useBuiltinPlugin } from "../../features/plugins/useBuiltinPlugin";
import { listenIslandHover } from "./api";
import type { CollapsedSlots } from "./types";

const EMPTY: CollapsedSlots = {};
const CLAUDE_USAGE_PLUGIN_ID = "focusd.claude-usage";

/**
 * The one place built-in plugins plug into the collapsed bar. Each plugin reads its own state
 * with useBuiltinPlugin(id) and fills a slot only while it is on. Slots left empty change
 * nothing on the bar. Keep the result stable (useMemo): the collapsed width is worked out from it.
 */
export function useCollapsedSlots({ paused, agents }: { paused: boolean; agents: readonly AgentActivity[] }): CollapsedSlots {
  const center = useBuiltinPlugin(CENTER_PATTERN_PLUGIN_ID);
  const usage = useBuiltinPlugin(CLAUDE_USAGE_PLUGIN_ID);
  const mood = usePetMood(agents, center.enabled);
  const choice = useMemo(() => centerPatternChoice(center.settings), [center.settings]);
  // Read here, not in the slot, so the pet is ready whenever the slot or the title shows it.
  const sheet = usePetSheet(center.enabled ? choice.petId : null, center);
  // A tray-hidden window keeps running; stop the animations there too.
  const hidden = usePageHidden();
  const still = paused || hidden;
  return useMemo(() => {
    const slots: CollapsedSlots = {};
    if (center.enabled) {
      const pet = typeof sheet === "string" ? sheet : null;
      slots.center = <CollapsedCenter choice={choice} sheet={sheet} mood={mood} paused={still} />;
      slots.centerWidth = pet ? CENTER_PET_WIDTH : CENTER_PATTERN_WIDTH;
      // While the bar names an agent the center is hidden, so the pet stands in for its icon.
      if (pet) slots.agentIcon = <PetSprite src={pet} mood={mood} paused={still} height={AGENT_ICON_PET_HEIGHT} />;
    }
    if (usage.enabled) {
      slots.gauges = <UsageGaugeSlot />;
      slots.sideWidth = CLAUDE_USAGE_GAUGE_WIDTH;
    }
    return Object.keys(slots).length === 0 ? EMPTY : slots;
  }, [center.enabled, usage.enabled, choice, sheet, mood, still]);
}

/** Follows the native island hover here, so the slots above stay the same object. */
function UsageGaugeSlot() {
  const [hovered, setHovered] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listenIslandHover(setHovered)
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) => console.error("Failed to listen for island hover", error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  return <ClaudeUsageGauge islandHovered={hovered} />;
}
