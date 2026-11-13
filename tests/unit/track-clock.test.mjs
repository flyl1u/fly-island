import assert from "node:assert/strict";
import test from "node:test";
import { advanceClock, clockPosition, hasTimeline, setClockPosition, NO_CLOCK } from "../../src/features/media/trackClock.ts";

test("players that report no position are timed by the island", () => {
  assert.equal(hasTimeline({ positionMs: 0, durationMs: 0 }), false);
  assert.equal(hasTimeline({ positionMs: 0, durationMs: 200_000 }), true);
});

test("calibration preserves pause, runs from the new anchor and resets on track changes", () => {
  let clock = advanceClock(NO_CLOCK, "song", true, 1000);
  clock = setClockPosition(clock, 30_000, 5000);
  assert.equal(clockPosition(clock, 6000), 31_000);
  clock = advanceClock(clock, "song", false, 7000);
  clock = setClockPosition(clock, 10_000, 8000);
  assert.equal(clockPosition(clock, 90_000), 10_000);
  clock = advanceClock(clock, "song", true, 100_000);
  assert.equal(clockPosition(clock, 101_000), 11_000);
  assert.equal(clockPosition(advanceClock(clock, "other", true, 102_000), 102_000), 0);
  assert.equal(setClockPosition(clock, NaN, 0), clock);
  assert.equal(setClockPosition(NO_CLOCK, 500, 0), NO_CLOCK);
  assert.equal(clockPosition(setClockPosition(clock, -50, 102_000), 102_000), 0);
  assert.equal(hasTimeline({ hasTimeline: false, positionMs: 30_000, durationMs: 200_000 }), false);
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
