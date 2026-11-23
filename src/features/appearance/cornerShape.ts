import type { IslandCornerShape } from "./types";

/**
 * The island's corner in CSS: Apple's continuous corner. Apple's curve for a radius R (Figma's
 * "corner smoothing" 60%) starts bending 1.6 R from the corner and has no kink where it meets the
 * straight edge. A superellipse(1.6) over a 1.4 R border radius traces it to within 1% of R, so
 * the island's radii are set 1.4x what a circular corner of the same size would use
 * (DEFAULT_ISLAND_CORNER_RADIUS). Rust hit-tests the same curve (CornerShape::Squircle in
 * island/state.rs).
 */
const SQUIRCLE_CURVATURE = 1.6;
export const ISLAND_SQUIRCLE = `superellipse(${SQUIRCLE_CURVATURE})`;

/** The CSS `corner-shape` value that draws `shape`. */
export function cornerShapeCss(shape: IslandCornerShape) {
  return shape === "squircle" ? ISLAND_SQUIRCLE : "round";
}

type Point = readonly [x: number, y: number];
type Cubic = readonly [start: Point, first: Point, second: Point, end: Point];

// Match native corner-shape: from the horizontal tangent (0, 0) to the vertical one (1, 1).
// Fit y(x) up to the diagonal, where its slope is 1, then reflect the fit across that diagonal.
function makeSquircleQuarter(): readonly Cubic[] {
  const exponent = 2 ** SQUIRCLE_CURVATURE;
  const diagonal = 2 ** (-1 / exponent);
  const height = (x: number) => 1 - (1 - x ** exponent) ** (1 / exponent);
  const slope = (x: number, y: number) => (x / (1 - y)) ** (exponent - 1);
  // Curvature changes fastest near the diagonal. Shorter sections there keep the fit accurate.
  const stops = [0, 0.5, 0.8, 1];
  const firstHalf: Cubic[] = [];
  for (let section = 1; section < stops.length; section++) {
    const x0 = diagonal * stops[section - 1];
    const x1 = diagonal * stops[section];
    const y0 = height(x0);
    const y1 = height(x1);
    const handle = (x1 - x0) / 3;
    firstHalf.push([
      [x0, y0], [x0 + handle, y0 + handle * slope(x0, y0)],
      [x1 - handle, y1 - handle * slope(x1, y1)], [x1, y1],
    ]);
  }
  const reflect = ([x, y]: Point): Point => [1 - y, 1 - x];
  const lastHalf = firstHalf.slice().reverse().map(([start, first, second, end]): Cubic =>
    [reflect(end), reflect(second), reflect(first), reflect(start)],
  );
  return [...firstHalf, ...lastHalf];
}

export const SQUIRCLE_QUARTER = makeSquircleQuarter();

type Axis = (fraction: number) => string;

function scaled(length: string, fraction: number) {
  const factor = Number(fraction.toFixed(7));
  if (factor === 0) return "0px";
  if (factor === 1) return length;
  return `calc(${length} * ${factor})`;
}

function sum(first: string, second: string) {
  if (first === "0px") return second;
  if (second === "0px") return first;
  return `calc(${first} + ${second})`;
}

function fromEnd(offset: string) {
  return offset === "0px" ? "100%" : `calc(100% - ${offset})`;
}

function shoulderedShape(squircle: boolean) {
  const shoulderRadius = "var(--island-shoulder-radius)";
  const bottomRadius = "var(--island-outline-bottom-radius)";
  const shoulderCoordinate = (fraction: number) => scaled(shoulderRadius, fraction);
  const bottomAcross = (fraction: number) => sum(shoulderRadius, scaled(bottomRadius, fraction));
  const bottomDown = (fraction: number) => fromEnd(scaled(bottomRadius, 1 - fraction));

  const bend = (x: Axis, y: Axis, shoulder: boolean, verticalEntry: boolean) => {
    const point = ([u, v]: Point) => verticalEntry ? `${x(v)} ${y(u)}` : `${x(u)} ${y(v)}`;
    if (!squircle) {
      const radius = shoulder ? shoulderRadius : bottomRadius;
      return `arc to ${point([1, 1])} of ${radius} ${shoulder ? "cw" : "ccw"}`;
    }
    return SQUIRCLE_QUARTER.map(([, first, second, end]) =>
      `curve to ${point(end)} with ${point(first)} / ${point(second)}`,
    ).join(", ");
  };

  return [
    "shape(from 0px 0px",
    bend(shoulderCoordinate, shoulderCoordinate, true, false),
    `vline to ${bottomDown(0)}`,
    bend(bottomAcross, bottomDown, false, true),
    `hline to ${fromEnd(bottomAcross(1))}`,
    bend((f) => fromEnd(bottomAcross(1 - f)), (f) => bottomDown(1 - f), false, false),
    `vline to ${shoulderRadius}`,
    bend((f) => fromEnd(shoulderCoordinate(1 - f)), (f) => shoulderCoordinate(1 - f), true, true),
    "close)",
  ].join(", ");
}

const SHOULDERED_SQUIRCLE = shoulderedShape(true);
const SHOULDERED_ROUND = shoulderedShape(false);

/** One path for the material layer, resolved against the island's current animated dimensions. */
export function shoulderedShapeCss(shape: IslandCornerShape) {
  return shape === "squircle" ? SHOULDERED_SQUIRCLE : SHOULDERED_ROUND;
}
