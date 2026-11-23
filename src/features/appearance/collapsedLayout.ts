import { normalizeOrder } from "../../utils/order.ts";
import { COLLAPSED_SLOTS } from "./settingsLimits.ts";
import type { CollapsedSlot } from "./types";

/**
 * A saved layout read back. The light was part of the text until 2026-11-19; a layout saved before
 * then gets it just left of the text, where it always was, not at the end with other new slots.
 */
export function normalizeCollapsedLayout(value: unknown): CollapsedSlot[] {
  const layout = normalizeOrder(value, COLLAPSED_SLOTS);
  if (!Array.isArray(value) || value.includes("pulse")) return layout;
  const withoutPulse: CollapsedSlot[] = layout.filter((slot) => slot !== "pulse");
  withoutPulse.splice(withoutPulse.indexOf("text"), 0, "pulse");
  return withoutPulse;
}

/** Slots dragged off the island: known ones once each, never the text (the island's open button). */
export function normalizeCollapsedHidden(value: unknown): CollapsedSlot[] {
  if (!Array.isArray(value)) return [];
  return value.filter((slot, index): slot is CollapsedSlot =>
    slot !== "text" && COLLAPSED_SLOTS.includes(slot as CollapsedSlot) && value.indexOf(slot) === index);
}

/**
 * The saved layout after the editor arranged what it shows: the island's slots in `shown` order,
 * then the hidden ones. Slots the editor does not show at all (`absent`: a plugin not installed)
 * keep their saved places, so they come back where they were.
 */
export function placeCollapsedLayout(saved: readonly CollapsedSlot[], shown: readonly CollapsedSlot[], absent: readonly CollapsedSlot[]): CollapsedSlot[] {
  const queue = [...shown, ...saved.filter((slot) => !shown.includes(slot) && !absent.includes(slot))];
  return saved.map((slot) => absent.includes(slot) ? slot : queue.shift() ?? slot);
}

/** What the collapsed island shows, left to right. */
export function visibleCollapsedSlots(layout: readonly CollapsedSlot[], hidden: readonly CollapsedSlot[]): CollapsedSlot[] {
  return layout.filter((slot) => !hidden.includes(slot));
}
