/** The collapsed island's own text when nothing else claims it, and what "todos left" shows. */

export const IDLE_TEXT_MAX_LENGTH = 40;
export const DEFAULT_IDLE_LABEL = "fly-island";

export const TODO_PENDING_DISPLAYS = ["pendingCount", "idleText"] as const;
export type TodoPendingDisplay = (typeof TODO_PENDING_DISPLAYS)[number];

/** Tolerant: anything but a string is empty; control characters and line breaks become spaces. */
export function normalizeIdleText(value: unknown): string {
  if (typeof value !== "string") return "";
  const flat = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return [...flat].slice(0, IDLE_TEXT_MAX_LENGTH).join("").trim();
}

export function normalizeTodoPendingDisplay(value: unknown): TodoPendingDisplay {
  return value === "idleText" ? "idleText" : "pendingCount";
}

/** The text itself; empty falls back to the product name. */
export function idleLabel(idleText: string): string {
  return normalizeIdleText(idleText) || DEFAULT_IDLE_LABEL;
}

type IdleTextState = { showTitle: boolean; idleText: string; todoPendingDisplay: TodoPendingDisplay };

/**
 * What the bar shows besides the item: `brand` is the title text (the "fly-island" title when
 * `showTitle` is on, a custom idle text even when it is off, but only while nothing else is
 * shown), and `pending` replaces the "N todos left" line when the user chose the idle text for it.
 * Saved settings without the new fields behave as before: no custom text, the count.
 */
export function idleTextDisplay(settings: IdleTextState, state: { itemShown: boolean; pendingLine: boolean }) {
  const label = idleLabel(settings.idleText);
  const custom = normalizeIdleText(settings.idleText) !== "";
  const pending = state.pendingLine && settings.todoPendingDisplay === "idleText" ? label : null;
  const brand = pending !== null ? null
    : settings.showTitle || (custom && !state.itemShown) ? label : null;
  return { brand, pending };
}
