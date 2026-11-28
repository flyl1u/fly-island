import assert from "node:assert/strict";
import test from "node:test";
import { countdownSeconds, elapsedSeconds, formatCountdown, nextCountdownDelay, nextElapsedDelay } from "../../src/utils/countdown.ts";

test("countdowns schedule at deadline boundaries regardless of mount time or a late callback", () => {
  const deadline = 60_250;
  assert.equal(nextCountdownDelay(deadline, 1100), 150);
  assert.equal(countdownSeconds(deadline, 1250), 59);
  assert.equal(nextCountdownDelay(deadline, 1400), 850);
  assert.equal(nextCountdownDelay(deadline, 2290), 960);
  assert.equal(nextCountdownDelay(deadline, 250), 1000);
  assert.equal(nextCountdownDelay(1000.5, 1000), 1);
});

test("absolute countdowns immediately reflect elapsed background time and stop scheduling at zero", () => {
  assert.equal(countdownSeconds(60_250, 10_750), 50);
  assert.equal(countdownSeconds(60_250, 60_250), 0);
  assert.equal(countdownSeconds(60_250, 90_000), 0);
  assert.equal(nextCountdownDelay(60_250, 90_000), null);
  assert.equal(countdownSeconds(null, 0), 0);
  assert.equal(nextCountdownDelay(null, 0), null);
});

test("one formatter preserves generic plugin clocks and pads Eye Care minutes on both surfaces", () => {
  assert.equal(formatCountdown(65), "1:05");
  assert.equal(formatCountdown(65, true), "01:05");
  assert.equal(formatCountdown(0, true), "00:00");
  assert.equal(formatCountdown(3601, true), "1:00:01");
});
test("a running total counts whole seconds up from its anchor and wakes on the next boundary", () => {
  assert.equal(elapsedSeconds(1_000, 1_000), 0);
  assert.equal(elapsedSeconds(1_000, 4_950), 3);
  assert.equal(elapsedSeconds(1_000, 90_500), 89);
  assert.equal(elapsedSeconds(null, 90_500), 0);
  // A clock that jumps backwards shows zero rather than a negative total.
  assert.equal(elapsedSeconds(10_000, 5_000), 0);
  assert.equal(nextElapsedDelay(1_000, 1_100), 900);
  assert.equal(nextElapsedDelay(1_000, 4_950), 50);
  assert.equal(nextElapsedDelay(1_000, 5_000), 1000);
  assert.equal(nextElapsedDelay(null, 5_000), null);
});
