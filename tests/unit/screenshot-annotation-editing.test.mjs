import assert from "node:assert/strict";
import test from "node:test";
import { drawAnnotation, nodePoints } from "../../src/features/screenshot/annotations.ts";
import { hitAnnotation, moveAnnotation, patchAnnotation, resizeAnnotation, wheelAnnotation } from "../../src/features/screenshot/annotationEditing.ts";

const rect = { kind: "rect", color: "#ff0000", width: 3, from: { x: 20, y: 30 }, to: { x: 120, y: 90 } };
const ellipse = { ...rect, kind: "ellipse" };
const geometry = (item) => [item.from, item.to];

test("fill toggles on an existing shape without changing its geometry or stroke", () => {
  for (const item of [rect, ellipse]) {
    const filled = patchAnnotation(item, { filled: true });
    assert.equal(filled.filled, true);
    assert.deepEqual(geometry(filled), geometry(item));
    assert.deepEqual(patchAnnotation(filled, { filled: false }), { ...item, filled: false });
    assert.equal(item.filled, undefined);
  }
});

test("rectangle and ellipse paint solid interiors only while fill is enabled", () => {
  for (const item of [rect, ellipse]) {
    const calls = [];
    const context = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, args]), set: () => true });
    drawAnnotation(context, { ...item, filled: true }, 1.5);
    assert.equal(calls.some(([key]) => key === (item.kind === "rect" ? "fillRect" : "fill")), true);
    calls.length = 0;
    drawAnnotation(context, { ...item, filled: false }, 1.5);
    assert.equal(calls.some(([key]) => key === "fillRect" || key === "fill"), false);
    assert.equal(calls.some(([key]) => key === (item.kind === "rect" ? "strokeRect" : "stroke")), true);
  }
});

test("ordinary wheel edits existing stroke width, never shape size; clamp at limits", () => {
  for (const item of [rect, ellipse, { ...rect, kind: "arrow" }, { kind: "pen", color: "red", width: 3, points: [rect.from, rect.to] }]) {
    assert.deepEqual(wheelAnnotation(item, -100), { ...item, width: 4 });
    assert.equal(wheelAnnotation({ ...item, width: 1 }, 100).width, 1);
    assert.equal(wheelAnnotation({ ...item, width: 24 }, -100).width, 24);
  }
});

test("existing shapes accept color, line style, width, fill and shape conversion together", () => {
  const next = patchAnnotation(rect, { color: "blue", width: 8, dash: "dotted", filled: true, shape: "ellipse" });
  assert.deepEqual(next, { ...rect, kind: "ellipse", color: "blue", width: 8, dash: "dotted", filled: true });
  assert.deepEqual(patchAnnotation({ ...rect, kind: "arrow" }, { filled: true, shape: "ellipse" }), { ...rect, kind: "arrow" });
});

test("closed shapes expose eight editable nodes; dragging corners or edges keeps opposite edges fixed", () => {
  assert.equal(nodePoints(rect).length, 8);
  assert.deepEqual(nodePoints(ellipse).find((node) => node.key === "e").point, { x: 120, y: 60 });
  assert.deepEqual(geometry(resizeAnnotation(rect, "e", 40, 50)), [rect.from, { x: 160, y: 90 }]);
  assert.deepEqual(geometry(resizeAnnotation(ellipse, "nw", -10, -20)), [{ x: 10, y: 10 }, ellipse.to]);
  const minimum = resizeAnnotation(rect, "nw", 500, 500);
  assert.equal(minimum.to.x - minimum.from.x, 4);
  assert.equal(minimum.to.y - minimum.from.y, 4);
});

test("hit testing selects visible strokes or filled interiors and respects drawing order", () => {
  assert.equal(hitAnnotation([rect], { x: 70, y: 60 }), null);
  assert.equal(hitAnnotation([{ ...rect, filled: true }], { x: 70, y: 60 }), 0);
  assert.equal(hitAnnotation([ellipse], { x: 70, y: 30 }), 0);
  assert.equal(hitAnnotation([ellipse], { x: 20, y: 30 }), null);
  assert.equal(hitAnnotation([ellipse, { ...rect, filled: true }], { x: 70, y: 30 }), 1);
  assert.equal(hitAnnotation([{ kind: "pen", color: "red", width: 3, points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }], { x: 50, y: 50 }), 0);
});

test("dragging a previously drawn shape preserves its size and style", () => {
  assert.deepEqual(moveAnnotation({ ...ellipse, filled: true }, 5, -4), {
    ...ellipse, filled: true, from: { x: 25, y: 26 }, to: { x: 125, y: 86 },
  });
});

test("previously drawn numbers and mosaics accept their toolbar adjustments", () => {
  const number = { kind: "number", color: "red", size: 28, at: rect.from, value: 2, style: "arabic" };
  assert.deepEqual(patchAnnotation(number, { numberStyle: "alpha", size: 40 }), { ...number, style: "alpha", size: 40 });
  const mosaic = { kind: "mosaic", size: 12, from: rect.from, to: rect.to };
  assert.equal(patchAnnotation(mosaic, { size: 30 }).size, 30);
  assert.equal(nodePoints(mosaic).length, 8);
});
