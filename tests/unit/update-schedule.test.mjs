import test from "node:test";
import assert from "node:assert/strict";
import { RECHECK_INTERVAL_MS, RETRY_DELAYS_MS, nextCheckDelay } from "../../src/features/updater/updateSchedule.ts";

test("a running island keeps checking for updates and retries failed checks sooner", () => {
  assert.equal(nextCheckDelay("latest", 0), RECHECK_INTERVAL_MS);
  // A failed startup check (no network yet after autostart) retries within minutes.
  assert.equal(nextCheckDelay("error", 1), RETRY_DELAYS_MS[0]);
  assert.equal(nextCheckDelay("error", 2), RETRY_DELAYS_MS[1]);
  assert.equal(nextCheckDelay("error", 9), RETRY_DELAYS_MS.at(-1));
  assert.equal(nextCheckDelay("error", 0), RETRY_DELAYS_MS[0]);
  // Found, busy or switched off: the todo already offers it, or there is nothing to check.
  for (const stage of ["available", "downloading", "ready", "installing", "done", "disabled", "checking", "idle"]) {
    assert.equal(nextCheckDelay(stage, 0), null, stage);
  }
});
