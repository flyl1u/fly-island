import type { CollapsedSlot } from "./types";

/** Hidden plugin slots retain their saved indices while the visible items are rearranged. */
export function mergeVisibleCollapsedLayout(saved: readonly CollapsedSlot[], visible: readonly CollapsedSlot[]): CollapsedSlot[] {
  const remaining = [...visible];
  return saved.map((slot) => visible.includes(slot) ? remaining.shift() ?? slot : slot);
}
