import assert from "node:assert/strict";
import test from "node:test";
import { arrowEndpointCursor, arrowGeometry, arrowHeadContains } from "../../src/features/screenshot/arrowGeometry.ts";
import { patchAnnotation, resizeAnnotation } from "../../src/features/screenshot/annotationEditing.ts";
import { fitScreenSelection, overlayWindows } from "../../src/features/screenshot/geometry.ts";
import { drawAnnotation } from "../../src/features/screenshot/annotations.ts";

const arrow = { kind: "arrow", color: "red", width: 8, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
test("old arrows default to one head; single, double and no heads keep the same endpoints", () => {
  assert.equal(arrowGeometry(arrow).heads.length, 1);
  for (const [heads, count] of [["single", 1], ["double", 2], ["none", 0]]) {
    const changed = patchAnnotation(arrow, { arrowHeads: heads });
    assert.deepEqual(changed.from, arrow.from); assert.deepEqual(changed.to, arrow.to);
    assert.equal(arrowGeometry(changed).heads.length, count);
    const calls = [];
    const context = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, args]), set: () => true });
    drawAnnotation(context, changed, 1.5);
    assert.equal(calls.filter(([key]) => key === "fill").length, count);
  }
});
test("short double arrows retain a non-reversed shaft and finite geometry", () => {
  const result = arrowGeometry({ ...arrow, heads: "double", width: 24, to: { x: 4, y: 0 } });
  assert.ok(result.from.x < result.to.x);
  assert.ok(result.heads.flat().every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.equal(arrowGeometry({ ...arrow, to: arrow.from }).heads.length, 0);
});
test("wide arrow heads remain selectable away from the thin shaft, in both directions", () => {
  const wide = { ...arrow, width: 24 };
  assert.equal(arrowHeadContains(wide, { x: 50, y: 15 }), true);
  assert.equal(arrowHeadContains({ ...wide, heads: "none" }, { x: 50, y: 15 }), false);
  assert.equal(arrowHeadContains({ ...wide, heads: "double" }, { x: 30, y: 10 }), true);
});
test("endpoint cursor follows horizontal, vertical and diagonal resizing directions", () => {
  assert.equal(arrowEndpointCursor(arrow.from, { x: 100, y: 0 }), "ew-resize");
  assert.equal(arrowEndpointCursor(arrow.from, { x: 0, y: 100 }), "ns-resize");
  assert.equal(arrowEndpointCursor(arrow.from, { x: 100, y: 100 }), "nwse-resize");
  assert.equal(arrowEndpointCursor(arrow.from, { x: 100, y: -100 }), "nesw-resize");
  assert.equal(resizeAnnotation({ ...arrow, heads: "double" }, "to", 20, 40).heads, "double");
});
test("full-screen edge snaps include top and bottom rows, including fractional DPI", () => {
  assert.deepEqual(fitScreenSelection({ x: 0, y: 1, width: 1919, height: 1078 }, 1920, 1080),
    { x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(overlayWindows([{ x: -1919, y: 101, width: 1918, height: 1078 }],
    { x: -1920, y: 100, width: 1920, height: 1080 }, 1.5), [{ x: 0, y: 0, width: 1280, height: 720 }]);
  assert.deepEqual(fitScreenSelection({ x: 100, y: 100, width: 500, height: 300 }, 1920, 1080),
    { x: 100, y: 100, width: 500, height: 300 });
});
