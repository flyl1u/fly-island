// One scroll gesture over the collapsed island switches its text by one item. A mouse notch is
// one large delta; a touchpad swipe is a long run of small ones followed by momentum.

/** Accumulated |deltaY| (px) before switching: below a mouse notch (about 100), above a brushed touchpad. */
export const WHEEL_SWITCH_THRESHOLD = 50;
/** Nothing switches again this soon after a switch, so one flick cannot skip through items. */
export const WHEEL_SWITCH_COOLDOWN_MS = 350;
/**
 * A touchpad's momentum can outlast the cooldown. Its events arrive every few tens of ms, so after
 * a switch a new gesture needs this long a pause (or a change of direction).
 */
export const WHEEL_GESTURE_GAP_MS = 150;

export type WheelGesture = { sum: number; lastAt: number; switchedAt: number; spent: boolean; direction: 1 | -1 };

export const IDLE_WHEEL_GESTURE: WheelGesture = { sum: 0, lastAt: -Infinity, switchedAt: -Infinity, spent: false, direction: 1 };

/** Feeds one wheel event in; `step` is 1 (down: next), -1 (up: previous) or 0. */
export function feedWheelGesture(gesture: WheelGesture, deltaY: number, now: number): { gesture: WheelGesture; step: 1 | -1 | 0 } {
  if (deltaY === 0) return { gesture, step: 0 };
  const direction = deltaY > 0 ? 1 : -1;
  const paused = now - gesture.lastAt >= WHEEL_GESTURE_GAP_MS;
  const reversed = direction !== gesture.direction;
  if (gesture.spent && (now - gesture.switchedAt < WHEEL_SWITCH_COOLDOWN_MS || (!paused && !reversed))) {
    // The spent gesture goes on: remember when it was last heard, not which way it now points.
    return { gesture: { ...gesture, lastAt: now }, step: 0 };
  }
  const sum = (gesture.spent || paused || reversed ? 0 : gesture.sum) + deltaY;
  if (Math.abs(sum) < WHEEL_SWITCH_THRESHOLD) {
    return { gesture: { ...gesture, sum, lastAt: now, spent: false, direction }, step: 0 };
  }
  return { gesture: { sum: 0, lastAt: now, switchedAt: now, spent: true, direction }, step: direction };
}
