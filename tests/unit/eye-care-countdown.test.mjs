import assert from "node:assert/strict";
import test from "node:test";
import { breakCountdown, POSTPONEMENT_MINUTES } from "../../src/features/eye-care/countdown.ts";

test("break countdown rounds up, remains readable at an hour and stops at zero", () => {
  assert.equal(breakCountdown(60_001, 0), "01:01");
  assert.equal(breakCountdown(3_600_000, 0), "1:00:00");
  assert.equal(breakCountdown(100, 200), "00:00");
  assert.deepEqual(POSTPONEMENT_MINUTES, [10, 15, 20, 25, 30]);
});
