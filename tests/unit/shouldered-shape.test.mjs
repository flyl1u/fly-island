import assert from "node:assert/strict";
import test from "node:test";
import { shoulderedShapeCss, SQUIRCLE_QUARTER } from "../../src/features/appearance/cornerShape.ts";
import { COLLAPSED_CORNER_RADIUS, ISLAND_CORNER_RADIUS, MAX_COLLAPSED_SCALE, MAX_EXPANDED_SCALE, TOP_EDGE_SHOULDER_SIZE } from "../../src/features/appearance/settingsLimits.ts";

test("the squircle is tangent to both straight edges and at every cubic join", () => {
  const first = SQUIRCLE_QUARTER[0];
  const last = SQUIRCLE_QUARTER.at(-1);
  assert.deepEqual(first[0], [0, 0]);
  assert.deepEqual(last[3], [1, 1]);
  assert.equal(first[1][1], 0);
  assert.equal(last[2][0], 1);
  for (let i = 1; i < SQUIRCLE_QUARTER.length; i += 1) {
    const [, , incoming, join] = SQUIRCLE_QUARTER[i - 1];
    const [start, outgoing] = SQUIRCLE_QUARTER[i];
    assert.ok(Math.hypot(join[0] - start[0], join[1] - start[1]) < 1e-12);
    const into = [join[0] - incoming[0], join[1] - incoming[1]];
    const out = [outgoing[0] - start[0], outgoing[1] - start[1]];
    assert.ok(Math.abs(into[0] * out[1] - into[1] * out[0]) < 1e-12);
    assert.ok(into[0] * out[0] + into[1] * out[1] > 0);
  }
});

test("the serialized squircle fit stays within a quarter of a device pixel", () => {
  const exponent = 2 ** 1.6;
  const radius = Math.max(
    ISLAND_CORNER_RADIUS.max * MAX_EXPANDED_SCALE,
    COLLAPSED_CORNER_RADIUS.max * MAX_COLLAPSED_SCALE,
    TOP_EDGE_SHOULDER_SIZE.max * MAX_COLLAPSED_SCALE * 1.4,
  ) * 1.01; // Include the opening spring's small overshoot.
  let error = 0;
  for (const [index, segment] of SQUIRCLE_QUARTER.entries()) {
    // CSS coefficients are written to seven decimal places.
    const controls = segment.map((point) => point.map((value) => Number(value.toFixed(7))));
    for (let i = 0; i <= 4096; i += 1) {
      const t = i / 4096;
      const u = 1 - t;
      const weights = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
      const [x, y] = [0, 1].map((axis) => controls.reduce((sum, point, j) => sum + point[axis] * weights[j], 0));
      const delta = index < SQUIRCLE_QUARTER.length / 2
        ? y - (1 - (1 - x ** exponent) ** (1 / exponent))
        : x - (1 - (1 - y) ** exponent) ** (1 / exponent);
      error = Math.max(error, Math.abs(delta));
    }
  }
  assert.ok(error * radius * 2 < 0.25, `${error * radius * 2} device pixels at DPR 2`);
});

test("each contour closes once and circular corners use native arcs", () => {
  const round = shoulderedShapeCss("round");
  const squircle = shoulderedShapeCss("squircle");
  for (const contour of [round, squircle]) {
    assert.match(contour, /^shape\(from 0px 0px, .*close\)$/);
    assert.equal(contour.match(/close/g).length, 1);
  }
  assert.equal(round.match(/of var\(--island-(?:shoulder|outline-bottom)-radius\) (?:cw|ccw)/g).length, 4);
  assert.equal(squircle.match(/curve to/g).length, 4 * SQUIRCLE_QUARTER.length);
});

