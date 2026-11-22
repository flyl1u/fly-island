// The collapsed slot's fixed size, before island scaling. BatteryReadout.css draws the same body width.
const BODY_WIDTH = 38;
// The cap, the button's own padding and the gap to the next item.
const AROUND_BODY = 18;
// The collapsed island's widest setting (settingsLimits.ts COLLAPSED_WIDTH).
const WIDEST_ISLAND = 480;

/**
 * The collapsed island's width with the battery slot on it: the slot adds its own room rather than
 * taking it from the text. `minimum` is the measured width the status items need (useCollapsedStatusWidth).
 */
export function batteryIslandWidth(base: number, shown: boolean, fontScale = 1, minimum = 0) {
  if (!shown) return base;
  return Math.min(WIDEST_ISLAND, Math.max(minimum, Math.ceil(base + BODY_WIDTH * fontScale + AROUND_BODY)));
}
