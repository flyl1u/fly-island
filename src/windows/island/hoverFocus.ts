/** How long the cursor rests on the expanded panel before it takes the focus, so passing over it does not. */
export const HOVER_FOCUS_DWELL_MS = 160;
/** How often a focus change held back by a pressed mouse button is tried again. */
export const HOVER_FOCUS_RETRY_MS = 120;

export type HoverFocusState = {
  expanded: boolean;
  hovering: boolean;
  /** A text field in the island has focus. */
  editing: boolean;
  /** Game mode: a full-screen app is in front and must keep the focus. */
  blocked: boolean;
};

export type HoverFocusAction = "take" | "release" | "none";

/**
 * What the island does with the keyboard focus: take it while the cursor is on the
 * expanded panel, hand it back once the cursor leaves or the island collapses. A
 * draft being typed keeps it while the panel stays open. Handing back is safe to ask
 * for at any time: the native side only acts when it took the focus from a window
 * (on hover or for a global shortcut) and still holds it.
 */
export function hoverFocusAction({ expanded, hovering, editing, blocked }: HoverFocusState): HoverFocusAction {
  if (expanded && hovering) return blocked ? "none" : "take";
  if (expanded && editing) return "none";
  return "release";
}
