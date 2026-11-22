import type { CollapsedItem } from "./types.ts";

/** Keep optional rows in their saved slots while only visible priorities are reordered. */
export function placeCollapsedPriority(saved: readonly CollapsedItem[], shown: readonly CollapsedItem[], absent: readonly CollapsedItem[]) {
  const queue = [...shown, ...saved.filter((item) => !shown.includes(item) && !absent.includes(item))];
  return saved.map((item) => absent.includes(item) ? item : queue.shift() ?? item);
}
