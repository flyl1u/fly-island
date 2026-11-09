// Where IslandHoverCard goes across the window.

/** Gap kept between the card and the window edges. */
const EDGE = 8;
/** Gap between the trigger (or island) and the card below it. */
export const CARD_OFFSET = 8;
// The arrow cursor reaches about this far left and right of the pointer (it points up-left and
// is drawn down and to the right), plus a little air.
const CURSOR_LEFT = 8;
const CURSOR_RIGHT = 22;

/**
 * The card's left edge: centred on `center` and kept inside the window, then moved to the left of
 * the pointer (or to its right when there is no room) if the cursor would cover it.
 */
export function cardLeft(center: number, width: number, viewport: number, pointerX: number | null) {
  const clamp = (left: number) => Math.min(Math.max(left, EDGE), viewport - width - EDGE);
  const left = clamp(center - width / 2);
  if (pointerX === null || left >= pointerX + CURSOR_RIGHT || left + width <= pointerX - CURSOR_LEFT) return left;
  const before = pointerX - CURSOR_LEFT - width;
  return before >= EDGE ? before : clamp(pointerX + CURSOR_RIGHT);
}
