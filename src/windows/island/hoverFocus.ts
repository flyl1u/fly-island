/** How long the cursor rests on the expanded panel before it takes the focus, so passing over it does not. */
export const HOVER_FOCUS_DWELL_MS = 160;
/** Shortest wait before the focus goes back once the cursor leaves the expanded panel. */
export const HOVER_FOCUS_RELEASE_MIN_MS = 300;
/** How often a focus change held back by a pressed mouse button is tried again. */
export const HOVER_FOCUS_RETRY_MS = 120;

export type HoverFocusState = {
  expanded: boolean;
  hovering: boolean;
  /**
   * The cursor has been on the expanded panel since it opened. A panel opened by a shortcut
   * (clipboard history) with the cursor elsewhere keeps the focus the shortcut gave it until
   * it closes; handing it back at once closed the panel as soon as the keys were let go.
   */
  entered: boolean;
  /** A text field in the island has focus. */
  editing: boolean;
  /** Game mode: a full-screen app is in front and must keep the focus. */
  blocked: boolean;
  /** The collapsed island shows the adaptive message reader, whose text can be selected. */
  reading?: boolean;
  /** Text inside the island is selected (Ctrl+C has to reach the island). */
  selecting?: boolean;
};

export type HoverFocusAction = "take" | "release" | "none";

/**
 * What the island does with the keyboard focus: take it while the cursor is on the
 * expanded panel, hand it back once the cursor leaves or the island collapses. A
 * draft being typed keeps it while the panel stays open. Handing back is safe to ask
 * for at any time: the native side only acts when it took the focus from a window
 * (on hover or for a global shortcut) and still holds it.
 */
export function hoverFocusAction({ expanded, hovering, entered, editing, blocked, reading = false, selecting = false }: HoverFocusState): HoverFocusAction {
  if (expanded && hovering) return blocked ? "none" : "take";
  // Reading a message on the collapsed island: hold the focus so a selection made there stays
  // active and Ctrl+C copies it, and keep it while that selection is still there.
  if (!expanded && reading && hovering) return blocked ? "none" : "take";
  if (selecting) return "none";
  if (expanded && (editing || !entered)) return "none";
  return "release";
}
