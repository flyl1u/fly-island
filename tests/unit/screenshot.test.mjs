import assert from "node:assert/strict";
import test from "node:test";
import { overlayWindows } from "../../src/features/screenshot/geometry.ts";
import { translateImageLines } from "../../src/features/screenshot/translation.ts";

test("screenshot snap uses the selected monitor's origin and DPI, clips spanning windows", () => {
  const screen = { x: -1920, y: 200, width: 1920, height: 1080 };
  assert.deepEqual(overlayWindows([
    { x: -1800, y: 260, width: 600, height: 300 },
    { x: -100, y: 300, width: 500, height: 300 },
    { x: 0, y: 0, width: 1920, height: 1080 },
  ], screen, 1.5), [
    { x: 80, y: 40, width: 400, height: 200 },
    { x: 1820 / 1.5, y: 100 / 1.5, width: 100 / 1.5, height: 200 },
  ]);
});

const lines = Array.from({ length: 6 }, (_, index) => ({ text: `${index}`, x: index * 5, y: 10, width: 100, height: 20 }));
test("image translation bounds concurrency, preserves row positions, reports partial errors", async () => {
  let running = 0;
  let max = 0;
  const results = [];
  await translateImageLines(lines, async (text) => {
    max = Math.max(max, ++running);
    await new Promise((resolve) => setTimeout(resolve, 2));
    running--;
    if (text === "2") throw new Error("provider unavailable");
    if (text === "3") return " ";
    return `translated ${text}`;
  }, (index, result) => { results[index] = result; });
  assert.equal(max, 2);
  assert.equal(results.length, 6);
  assert.match(results[2].error, /provider unavailable/);
  assert.equal(results[3].error, "");
  assert.equal(results[5].translated, "translated 5");
  assert.equal(results[5].x, lines[5].x);
});

test("closing the translation window prevents queued work and stale results", async () => {
  let cancelled = false;
  let requested = 0;
  let displayed = 0;
  await translateImageLines(lines, async () => {
    requested++;
    await new Promise((resolve) => setTimeout(resolve, 1));
    cancelled = true;
    return "stale";
  }, () => displayed++, () => cancelled);
  assert.equal(requested, 2);
  assert.equal(displayed, 0);
});
