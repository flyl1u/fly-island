import assert from "node:assert/strict";
import test from "node:test";
import { advanceClock, clockPosition, hasTimeline, NO_CLOCK } from "../../src/features/media/trackClock.ts";

test("players that report no position are timed by the island", () => {
  assert.equal(hasTimeline({ positionMs: 0, durationMs: 0 }), false);
  assert.equal(hasTimeline({ positionMs: 0, durationMs: 200_000 }), true);
});

test("the clock counts only playing time and restarts for another track", () => {
  let clock = advanceClock(NO_CLOCK, "余香", true, 1000);
  assert.equal(clockPosition(clock, 4000), 3000);
  clock = advanceClock(clock, "余香", false, 5000);
  assert.equal(clockPosition(clock, 60_000), 4000);
  clock = advanceClock(clock, "余香", true, 70_000);
  assert.equal(clockPosition(clock, 71_000), 5000);
  // Readings that change nothing keep the same clock.
  assert.equal(advanceClock(clock, "余香", true, 72_000), clock);
  clock = advanceClock(clock, "晴天", false, 80_000);
  assert.equal(clockPosition(clock, 90_000), 0);
});
