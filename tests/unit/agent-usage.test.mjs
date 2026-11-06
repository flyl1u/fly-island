import assert from "node:assert/strict";
import test from "node:test";
import { isStale, tightestWindow, untilReset, usageLevel } from "../../src/features/agent-status/usage.ts";

const window = (name, used, resetsAt = null) => ({ name, used, resetsAt });

test("usage levels and the time until a window resets", () => {
  assert.deepEqual([usageLevel(0), usageLevel(49), usageLevel(50), usageLevel(84), usageLevel(85), usageLevel(100)], ["low", "low", "medium", "medium", "high", "high"]);
  const now = 1_000_000_000;
  assert.deepEqual(untilReset(now + (34 * 60 + 10) * 60_000 + 30_000, now), { days: 1, hours: 10, minutes: 11 });
  assert.deepEqual(untilReset(now + 59_000, now), { days: 0, hours: 0, minutes: 1 });
  assert.equal(untilReset(now - 1, now), null);
  assert.equal(untilReset(null, now), null);
});

test("the reset time shown is the fullest window's", () => {
  const usage = { updatedAt: 0, fiveHour: window("", 27), sevenDay: window("", 47), models: [window("Fable", 100)], plan: null };
  assert.equal(tightestWindow(usage)?.name, "Fable");
  assert.equal(tightestWindow({ ...usage, models: [] })?.used, 47);
  assert.equal(tightestWindow({ updatedAt: 0, fiveHour: null, sevenDay: null, models: [], plan: null }), null);
  assert.equal(isStale(usage, 16 * 60_000), true);
  assert.equal(isStale(usage, 10 * 60_000), false);
  assert.equal(isStale({ ...usage, updatedAt: null }, 10 ** 12), false);
});
