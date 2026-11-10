import type { IslandCornerShape } from "./types";

/**
 * The island's "squircle" in CSS. Not `corner-shape: squircle` itself (superellipse(2)): that
 * curve hugs the corner so closely that even a large radius reads as a box. This milder
 * superellipse still eases into the straight edges, which a circular arc does not, and keeps the
 * corner visibly round. Rust hit-tests the same curve (CornerShape::Squircle in island/state.rs).
 */
export const ISLAND_SQUIRCLE = "superellipse(1.3)";

/** The CSS `corner-shape` value that draws `shape`. */
export function cornerShapeCss(shape: IslandCornerShape) {
  return shape === "squircle" ? ISLAND_SQUIRCLE : "round";
}
