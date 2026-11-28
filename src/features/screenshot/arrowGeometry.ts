import type { Point } from "./annotations";

export type ArrowHeads = "single" | "double" | "none";
type Arrow = { from: Point; to: Point; width: number; heads?: ArrowHeads };

/** Calculate the same shaft/heads for preview and export, including short double-ended arrows. */
export function arrowGeometry(item: Arrow) {
  const dx = item.to.x - item.from.x, dy = item.to.y - item.from.y;
  const length = Math.hypot(dx, dy);
  const mode = item.heads ?? "single";
  const head = mode === "none" ? 0 : Math.min(Math.max(item.width * 3.5, 9), length * (mode === "double" ? 0.45 : 0.6));
  const ux = length ? dx / length : 0, uy = length ? dy / length : 0;
  const triangle = (tip: Point, x: number, y: number): Point[] => [tip,
    { x: tip.x - head * (x * Math.cos(0.38) - y * Math.sin(0.38)), y: tip.y - head * (y * Math.cos(0.38) + x * Math.sin(0.38)) },
    { x: tip.x - head * (x * Math.cos(0.38) + y * Math.sin(0.38)), y: tip.y - head * (y * Math.cos(0.38) - x * Math.sin(0.38)) }];
  return {
    from: mode === "double" ? { x: item.from.x + ux * head * 0.85, y: item.from.y + uy * head * 0.85 } : item.from,
    to: { x: item.to.x - ux * head * 0.85, y: item.to.y - uy * head * 0.85 },
    heads: head ? [...(mode === "double" ? [triangle(item.from, -ux, -uy)] : []), triangle(item.to, ux, uy)] : [],
  };
}

export function arrowEndpointCursor(from: Point, to: Point): string {
  const direction = (Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) + 4) % 4;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][direction];
}

export function arrowHeadContains(item: Arrow, point: Point): boolean {
  return arrowGeometry(item).heads.some((head) => {
    const signs = head.map((at, index) => {
      const next = head[(index + 1) % 3];
      return (next.x - at.x) * (point.y - at.y) - (next.y - at.y) * (point.x - at.x);
    });
    return signs.every((value) => value >= 0) || signs.every((value) => value <= 0);
  });
}
