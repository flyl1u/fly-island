import { arrowHeadContains, type ArrowHeads } from "./arrowGeometry.ts";
import { hitText, type Annotation, type Dash, type NumberStyle, type Point, type Shape } from "./annotations.ts";

export type AnnotationStylePatch = {
  color?: string; width?: number; dash?: Dash; filled?: boolean; shape?: Shape;
  size?: number; numberStyle?: NumberStyle; arrowHeads?: ArrowHeads;
};

/** Only apply properties supported by the selected annotation; geometry stays unchanged. */
export function patchAnnotation(item: Annotation, patch: AnnotationStylePatch): Annotation {
  let next = { ...item };
  if (patch.color !== undefined && "color" in next) next.color = patch.color;
  if ("width" in next) {
    if (patch.width !== undefined) next.width = Math.max(1, Math.min(24, patch.width));
    if (patch.dash !== undefined) next.dash = patch.dash;
  }
  if (next.kind === "rect" || next.kind === "ellipse") {
    if (patch.filled !== undefined) next.filled = patch.filled;
    if (patch.shape !== undefined) next = { ...next, kind: patch.shape };
  }
  if (patch.size !== undefined && "size" in next) {
    const min = next.kind === "mosaic" ? 4 : next.kind === "number" ? 12 : 8;
    const max = next.kind === "mosaic" ? 40 : next.kind === "number" ? 120 : 160;
    next.size = Math.max(min, Math.min(max, patch.size));
  }
  if (patch.arrowHeads !== undefined && next.kind === "arrow") next.heads = patch.arrowHeads;
  if (patch.numberStyle !== undefined && next.kind === "number") next.style = patch.numberStyle;
  return next;
}

export function wheelAnnotation(item: Annotation, deltaY: number): Annotation {
  if (!deltaY) return item;
  const step = deltaY < 0 ? 1 : -1;
  if ("width" in item) return patchAnnotation(item, { width: item.width + step });
  if ("size" in item) return patchAnnotation(item, { size: item.size + step * 2 });
  return item;
}

export function moveAnnotation(item: Annotation, dx: number, dy: number): Annotation {
  const move = (point: Point) => ({ x: point.x + dx, y: point.y + dy });
  if ("from" in item) return { ...item, from: move(item.from), to: move(item.to) };
  if (item.kind === "pen") return { ...item, points: item.points.map(move) };
  return { ...item, at: move(item.at) };
}

function segmentDistance(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const squared = dx * dx + dy * dy;
  const t = squared ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / squared)) : 0;
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
}

/** Test from front to back, including filled interiors, without treating empty ellipse corners as ink. */
export function hitAnnotation(items: Annotation[], point: Point): number | null {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    const near = "width" in item ? 6 + item.width / 2 : 8;
    if (item.kind === "text") { if (hitText([item], point) !== null) return index; }
    else if (item.kind === "number") {
      const radius = item.size / 2;
      if (Math.hypot(point.x - item.at.x - radius, point.y - item.at.y - radius) <= radius + near) return index;
    } else if (item.kind === "pen") {
      if (item.points.some((at, i) => segmentDistance(point, at, item.points[Math.max(0, i - 1)]) <= near)) return index;
    } else if (item.kind === "arrow") {
      if (segmentDistance(point, item.from, item.to) <= near || arrowHeadContains(item, point)) return index;
    } else {
      const left = Math.min(item.from.x, item.to.x), top = Math.min(item.from.y, item.to.y);
      const width = Math.abs(item.to.x - item.from.x), height = Math.abs(item.to.y - item.from.y);
      if (item.kind === "ellipse") {
        const rx = width / 2, ry = height / 2;
        if (!rx || !ry) { if (segmentDistance(point, item.from, item.to) <= near) return index; continue; }
        const distance = Math.hypot((point.x - left - rx) / rx, (point.y - top - ry) / ry);
        if (item.filled ? distance <= 1 + near / Math.min(rx, ry) : Math.abs(distance - 1) * Math.min(rx, ry) <= near) return index;
      } else {
        const inside = point.x >= left && point.x <= left + width && point.y >= top && point.y <= top + height;
        if (inside && (item.kind === "mosaic" || item.filled)) return index;
        const corners = [{ x: left, y: top }, { x: left + width, y: top }, { x: left + width, y: top + height }, { x: left, y: top + height }];
        if (corners.some((at, i) => segmentDistance(point, at, corners[(i + 1) % 4]) <= near)) return index;
      }
    }
  }
  return null;
}

export function resizeAnnotation(item: Annotation, handle: string, dx: number, dy: number): Annotation {
  if (item.kind === "arrow") return handle === "from"
    ? { ...item, from: { x: item.from.x + dx, y: item.from.y + dy } }
    : { ...item, to: { x: item.to.x + dx, y: item.to.y + dy } };
  if (item.kind !== "rect" && item.kind !== "ellipse" && item.kind !== "mosaic") return item;
  let left = Math.min(item.from.x, item.to.x), right = Math.max(item.from.x, item.to.x);
  let top = Math.min(item.from.y, item.to.y), bottom = Math.max(item.from.y, item.to.y);
  if (handle.includes("w")) left = Math.min(right - 4, left + dx);
  if (handle.includes("e")) right = Math.max(left + 4, right + dx);
  if (handle.includes("n")) top = Math.min(bottom - 4, top + dy);
  if (handle.includes("s")) bottom = Math.max(top + 4, bottom + dy);
  return { ...item, from: { x: left, y: top }, to: { x: right, y: bottom } };
}
