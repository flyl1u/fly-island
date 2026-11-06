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
export function useCollapsedSlots(): CollapsedSlots {
  return EMPTY;
}
