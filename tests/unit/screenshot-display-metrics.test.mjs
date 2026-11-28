import assert from "node:assert/strict";
import test from "node:test";
import { viewportMatchesDisplay, waitForScreenshotViewport } from "../../src/features/screenshot/displayMetrics.ts";
import { overlayWindows } from "../../src/features/screenshot/geometry.ts";

test("switching from 100% to 125% waits for both DPI and CSS viewport, accepts fractional rounding", async () => {
  const region = { x: -1366, y: 200, width: 1366, height: 768 };
  const settled = { width: 1093, height: 614, dpr: 1.25 };
  const frames = [{ width: 1366, height: 768, dpr: 1 }, { width: 1366, height: 768, dpr: 1.25 }, settled];
  let reads = 0;
  const result = await waitForScreenshotViewport(region, 1.25, () => frames[Math.min(reads++, 2)]);
  assert.equal(reads, 3); assert.deepEqual(result, settled);
  assert.equal(viewportMatchesDisplay(region, 1.25, settled), true);
});
test("native capture uses separate horizontal and vertical ratios for fractional-size viewports", () => {
  const region = { x: -1366, y: 200, width: 1366, height: 768 };
  const sx = 1366 / 1093, sy = 768 / 614;
  assert.notEqual(Math.round(614 * sx), 768);
  const [full] = overlayWindows([region], region, sx, sy);
  assert.equal(Math.round(full.width * sx), 1366);
  assert.equal(Math.round(full.height * sy), 768);
});
