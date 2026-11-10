import type { IslandCornerShape } from "./types";

/**
 * The island's corner in CSS: Apple's continuous corner. Apple's curve for a radius R (Figma's
 * "corner smoothing" 60%) starts bending 1.6 R from the corner and has no kink where it meets the
 * straight edge. A superellipse(1.6) over a 1.4 R border radius traces it to within 1% of R, so
 * the island's radii are set 1.4x what a circular corner of the same size would use
 * (DEFAULT_ISLAND_CORNER_RADIUS). Rust hit-tests the same curve (CornerShape::Squircle in
 * island/state.rs).
 */
export const ISLAND_SQUIRCLE = "superellipse(1.6)";

/** The CSS `corner-shape` value that draws `shape`. */
export function cornerShapeCss(shape: IslandCornerShape) {
  return shape === "squircle" ? ISLAND_SQUIRCLE : "round";
}
