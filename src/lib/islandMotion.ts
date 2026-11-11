// When the island's shape is animating (opening, closing, resizing for another page). Polls whose
// answer re-renders the whole island skip a tick meanwhile: a render landing mid-motion is a
// dropped frame, and the next tick comes soon enough. Set by useMotionLayer (windows/island).
let movingUntil = 0;

/** Notes that the island's shape animates for the next `ms`. */
export function noteIslandMotion(ms: number) {
  movingUntil = Math.max(movingUntil, performance.now() + ms);
}

/** Whether the island's shape is animating now. */
export function isIslandMoving() {
  return performance.now() < movingUntil;
}
