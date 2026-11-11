import type { CollapsedItem } from "../../features/appearance/types";

/**
 * What the collapsed island shows: the first of `order` that has something to show (`has`).
 * A todo only takes its place in the order once the user has started one (`todoStarted`); an
 * unstarted todo (a rotating title or the remaining count) shows only when nothing else has
 * anything, so a running agent or a lyric line is not hidden behind "3 todos left".
 */
export function pickCollapsedItem(
  order: readonly CollapsedItem[],
  has: Record<CollapsedItem, boolean>,
  todoStarted = true,
): CollapsedItem | null {
  const ranked = order.find((item) => has[item] && (item !== "todo" || todoStarted));
  if (ranked) return ranked;
  return has.todo ? "todo" : null;
}
