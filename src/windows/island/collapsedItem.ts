import type { CollapsedItem } from "../../features/appearance/types";

export type CollapsedAvailability = Readonly<Record<CollapsedItem, boolean>>;

/**
 * What the collapsed island shows: the first of `order` that has something to show (`has`).
 * A todo only takes its place in the order once the user has started one (`todoStarted`); an
 * unstarted todo (a rotating title or the remaining count) shows only when nothing else has
 * anything, so a running agent or a lyric line is not hidden behind "3 todos left".
 */
export function pickCollapsedItem(
  order: readonly CollapsedItem[],
  has: CollapsedAvailability,
  todoStarted = true,
): CollapsedItem | null {
  const ranked = order.find((item) => has[item] && (item !== "todo" || todoStarted));
  if (ranked) return ranked;
  return has.todo ? "todo" : null;
}

export function resolveCollapsedItem(order: readonly CollapsedItem[], available: CollapsedAvailability,
  canSwitchTo: CollapsedAvailability, choice: CollapsedItem | null, todoStarted: boolean, countdown: boolean) {
  const retainedChoice = choice !== null && canSwitchTo[choice] ? choice : null;
  return { choice: retainedChoice, item: retainedChoice ?? (countdown ? "todo" : pickCollapsedItem(order, available, todoStarted)) };
}

/** The next (`direction` 1) or previous (-1) available item after `shown`, round the ends. */
export function nextCollapsedItem(order: readonly CollapsedItem[], available: CollapsedAvailability, shown: CollapsedItem | null, direction: 1 | -1 = 1) {
  if (order.filter((item) => available[item]).length < 2) return null;
  const turned = direction === 1 ? order : [...order].reverse();
  const index = shown === null ? -1 : turned.indexOf(shown);
  return [...turned.slice(index + 1), ...turned.slice(0, index + 1)].find((item) => available[item]) ?? null;
}
