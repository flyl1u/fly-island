import assert from "node:assert/strict";
import test from "node:test";
import { isPositionJump, positionAtPointer, steadyAnchor } from "../../src/features/media/positionAnchor.ts";

const song = { title: "晴天", artist: "周杰伦", sourceApp: "Spotify.exe", activeSessionId: "Spotify.exe", durationMs: 269_000 };
const reading = (positionMs, updatedAt, playbackStatus = "playing", extra = {}) =>
  ({ ...song, positionMs, updatedAt, playbackStatus, ...extra });

test("a reading that agrees with the running estimate keeps the island's anchor", () => {
  const current = reading(60_000, 1_000);
  // 1.5 s later the player says 61.62 s: within jitter of the 61.5 s the island reckons.
  assert.deepEqual(steadyAnchor(current, reading(61_620, 2_500)), { positionMs: 60_000, updatedAt: 1_000 });
  // Paused and unmoved: the same.
  const paused = reading(30_000, 1_000, "paused");
  assert.deepEqual(steadyAnchor(paused, reading(30_000, 9_000, "paused")), { positionMs: 30_000, updatedAt: 1_000 });
});

test("a seek, a pause, a resume or another track takes the new reading", () => {
  const current = reading(60_000, 1_000);
  // Seeked in the player to 2:30.
  assert.deepEqual(steadyAnchor(current, reading(150_000, 2_500)), { positionMs: 150_000, updatedAt: 2_500 });
  // Seeked back a little (a second): beyond jitter, so it snaps too.
  assert.deepEqual(steadyAnchor(current, reading(60_500, 2_500)), { positionMs: 60_500, updatedAt: 2_500 });
  assert.deepEqual(steadyAnchor(current, reading(61_500, 2_500, "paused")), { positionMs: 61_500, updatedAt: 2_500 });
  assert.deepEqual(steadyAnchor(reading(61_500, 2_500, "paused"), reading(61_500, 90_000)), { positionMs: 61_500, updatedAt: 90_000 });
  assert.deepEqual(steadyAnchor(current, reading(61_500, 2_500, "playing", { title: "七里香" })), { positionMs: 61_500, updatedAt: 2_500 });
  // Nothing to keep before the first reading.
  assert.deepEqual(steadyAnchor(reading(0, 0, "paused"), reading(0, 2_500, "paused")), { positionMs: 0, updatedAt: 2_500 });
});

test("a jump is a move the time passed does not explain", () => {
  const before = reading(60_000, 1_000);
  assert.equal(isPositionJump(before, reading(61_500, 2_500)), false);
  assert.equal(isPositionJump(before, reading(150_000, 2_500)), true);
  assert.equal(isPositionJump(before, reading(0, 2_500)), true);
  // While paused nothing moves, so a big change is a jump.
  assert.equal(isPositionJump(reading(60_000, 1_000, "paused"), reading(60_000, 20_000, "paused")), false);
  assert.equal(isPositionJump(reading(60_000, 1_000, "paused"), reading(90_000, 20_000, "paused")), true);
});

test("the pointer picks a position along the bar", () => {
  assert.equal(positionAtPointer(150, 100, 200, 200_000), 50_000);
  assert.equal(positionAtPointer(40, 100, 200, 200_000), 0);
  assert.equal(positionAtPointer(400, 100, 200, 200_000), 200_000);
  assert.equal(positionAtPointer(150, 100, 0, 200_000), 0);
});
