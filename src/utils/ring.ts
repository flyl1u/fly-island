import { clamp } from "./number.ts";

/** Stroke dash for one arc of a ring, for an SVG circle turned to start at 12 o'clock. */
export type RingArc = { dashArray: string; dashOffset: number };

/**
 * Radius of the `index`-th ring counted from the outside, or 0 when it no longer fits: below
 * half a stroke the stroke would fill the middle and draw a blob instead of a ring.
 */
export function ringRadius(size: number, strokeWidth: number, index: number, gap: number) {
  const radius = (size - strokeWidth) / 2 - index * (strokeWidth + gap);
  return radius < strokeWidth / 2 ? 0 : radius;
}

/**
 * The dash that draws `share` (0–1) of a ring clockwise from `start` (0–1 of the way round).
 * Round caps reach half a stroke past each end, so the dash is shortened by a stroke to keep
 * the arc's ends where its value says; `gap` leaves room between neighbouring segments.
 * Nothing (null) for a zero share, a dot for a share too small to show its length.
 */
export function ringArc(radius: number, strokeWidth: number, start: number, share: number, gap = 0): RingArc | null {
  const value = clamp(Number.isFinite(share) ? share : 0, 0, 1);
  if (value <= 0 || radius <= 0) return null;
  const circumference = 2 * Math.PI * radius;
  if (value >= 1 && gap === 0) return { dashArray: `${circumference} 0`, dashOffset: 0 };
  // A near-zero dash still draws its round cap: a dot the width of the stroke.
  const length = Math.max(0.001, value * circumference - strokeWidth - gap);
  return {
    dashArray: `${length} ${circumference}`,
    dashOffset: -(clamp(start, 0, 1) * circumference + (strokeWidth + gap) / 2),
  };
}

/** Where each segment starts (0–1), with shares scaled down if they add up to more than a ring. */
export function segmentStarts(shares: readonly number[]) {
  const values = shares.map((share) => (Number.isFinite(share) ? Math.max(0, share) : 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  const scale = total > 1 ? 1 / total : 1;
  let start = 0;
  return values.map((value) => {
    const segment = { start, share: value * scale };
    start += segment.share;
    return segment;
  });
}
