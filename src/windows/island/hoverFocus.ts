/** How long the cursor rests on the expanded panel before it takes the focus, so passing over it does not. */
export const HOVER_FOCUS_DWELL_MS = 160;
/** How often a focus change held back by a pressed mouse button is tried again. */
export const HOVER_FOCUS_RETRY_MS = 120;

export type HoverFocusState = {
  expanded: boolean;
  hovering: boolean;
  /** The island took the focus (or asked to) and has not handed it back yet. */
  holding: boolean;
  /** A text field in the island has focus. */
  editing: boolean;
};

export type HoverFocusAction = "take" | "release" | "none";

/**
 * What the island does with the keyboard focus: take it while the cursor is on the
 * expanded panel, hand it back once the cursor leaves or the island collapses. A
 * draft being typed keeps it while the panel stays open.
 */
export function hoverFocusAction({ expanded, hovering, holding, editing }: HoverFocusState): HoverFocusAction {
  if (expanded && hovering) return "take";
  if (!holding || (expanded && editing)) return "none";
  return "release";
}
