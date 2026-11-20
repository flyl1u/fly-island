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

/**
 * A bottom corner of the island as a mask image, for the attached shoulders (IslandGlass.css).
 * There the island and its shoulders are one masked layer, so the corner cannot come from
 * border-radius; this traces the same curve as `corner-shape` over a 1x1 box stretched to the radius.
 */
export function cornerMaskCss(shape: IslandCornerShape, side: "left" | "right") {
  const exponent = shape === "squircle" ? 2 ** 1.6 : 2;
  const steps = 32;
  const points: string[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * (Math.PI / 2);
    const across = Math.cos(angle) ** (2 / exponent);
    const down = Math.sin(angle) ** (2 / exponent);
    const x = side === "left" ? 100 * (1 - across) : 100 * across;
    points.push(`${x.toFixed(2)} ${(100 * down).toFixed(2)}`);
  }
  const inner = side === "left" ? 100 : 0;
  const path = `M${inner} 0L${points.join("L")}L${inner} 100Z`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='${path}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
