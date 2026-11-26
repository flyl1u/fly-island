import assert from "node:assert/strict";
import test from "node:test";
import { countdownSeconds, formatCountdown, nextCountdownDelay } from "../../src/utils/countdown.ts";

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
