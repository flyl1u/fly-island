import assert from "node:assert/strict";
import test from "node:test";
import { ringArc, ringRadius, segmentStarts } from "../../src/utils/ring.ts";

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ≠ ${expected}`);
const dash = (arc) => arc.dashArray.split(" ").map(Number);

test("concentric rings step inward by a stroke and a gap, and stop when they no longer fit", () => {
  assert.equal(ringRadius(20, 2, 0, 1), 9);
  assert.equal(ringRadius(20, 2, 1, 1), 6);
  assert.equal(ringRadius(20, 2, 4, 1), 0);
  // 0.75px left with a 2.5px stroke would draw a filled dot, not a ring.
  assert.equal(ringRadius(20, 2.5, 2, 1.5), 0);
});

test("a zero, negative or invalid share draws nothing", () => {
  for (const share of [0, -0.2, Number.NaN]) assert.equal(ringArc(9, 2, 0, share), null, String(share));
  assert.equal(ringArc(0, 2, 0, 0.5), null);
});

test("a full ring without gaps is one closed stroke", () => {
  const circumference = 2 * Math.PI * 9;
  assert.deepEqual(ringArc(9, 2, 0, 1), { dashArray: `${circumference} 0`, dashOffset: 0 });
  assert.deepEqual(ringArc(9, 2, 0, 3), ringArc(9, 2, 0, 1));
});

test("a partial arc is shortened by its round caps and starts at its value", () => {
  const circumference = 2 * Math.PI * 9;
  const arc = ringArc(9, 2, 0.25, 0.5, 1);
  const [length, space] = dash(arc);
  near(length, circumference / 2 - 2 - 1, "length");
  near(space, circumference, "space");
  near(arc.dashOffset, -(circumference / 4 + 1.5), "offset");
});

test("a share too small to show its length still draws a dot", () => {
  const [length] = dash(ringArc(9, 2, 0, 0.001));
  assert.ok(length > 0 && length < 0.01);
});

test("segments start where the previous one ends, scaled into one ring when they add up to more", () => {
  assert.deepEqual(segmentStarts([0.5, 0.25, 0]), [
    { start: 0, share: 0.5 }, { start: 0.5, share: 0.25 }, { start: 0.75, share: 0 },
  ]);
  const scaled = segmentStarts([1, 1, Number.NaN, -1]);
  assert.deepEqual(scaled.map((segment) => segment.share), [0.5, 0.5, 0, 0]);
  near(scaled[1].start, 0.5, "second start");
});
