import assert from "node:assert/strict";
import test from "node:test";
import { gazeOffset, petRow, petSheetRows, petSpriteLayout } from "../../src/features/center-pattern/patterns.ts";

test("pet moods map to petdex rows and their frame counts", () => {
  assert.deepEqual(petRow("idle"), { row: 0, frames: 6, durationMs: 1100 });
  assert.equal(petRow("running").row, 7);
  assert.equal(petRow("waiting").row, 6);
  assert.equal(petRow("failed").row, 5);
  assert.equal(petRow("failed").frames, 8);
  assert.equal(petRow("done").row, 3); // waving
  assert.equal(petRow("nonsense").row, 0, "unknown moods fall back to idle");
});

test("sheet rows come from the pixel size, at any clean scale", () => {
  assert.equal(petSheetRows(1536, 1872), 9);
  assert.equal(petSheetRows(1536, 2288), 11); // v2
  assert.equal(petSheetRows(768, 936), 9);
  assert.equal(petSheetRows(1536, 1536), null);
  assert.equal(petSheetRows(0, 0), null);
  assert.equal(petSheetRows(Number.NaN, 10), null);
});

test("the sprite layout shifts to the row and steps across its frames", () => {
  assert.deepEqual(petSpriteLayout("idle", 9), { rowShift: -0, loopShift: -75, frames: 6, durationMs: 1100 });
  const running = petSpriteLayout("running", 9);
  assert.ok(Math.abs(running.rowShift - (-700 / 9)) < 1e-9);
  assert.equal(running.loopShift, -75);
  assert.equal(petSpriteLayout("failed", 11).loopShift, -100);
  assert.ok(Math.abs(petSpriteLayout("done", 11).rowShift - (-300 / 11)) < 1e-9);
});

test("pupils look toward the point and stop at the edge of the eye", () => {
  assert.deepEqual(gazeOffset(0, 0, 3), { x: 0, y: 0 });
  assert.deepEqual(gazeOffset(500, 0, 3), { x: 3, y: 0 });
  const near = gazeOffset(45, 0, 3, 90);
  assert.equal(near.x, 1.5);
  const down = gazeOffset(0, 500, 3);
  assert.equal(down.x, 0);
  assert.equal(down.y, 2.25);
  const diagonal = gazeOffset(-300, -300, 2);
  assert.ok(diagonal.x < 0 && diagonal.y < 0 && Math.hypot(diagonal.x, diagonal.y) <= 2);
});
