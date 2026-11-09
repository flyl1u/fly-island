import assert from "node:assert/strict";
import test from "node:test";
import { nextQQPreview } from "../../src/features/messages/qqNotificationTiming.ts";

test("a new message previews for five seconds", () => {
  assert.equal(nextQQPreview(null, 1_000).expiresAt, 6_000);
});

test("a continuous burst stops at ten seconds and does not immediately restart", () => {
  let state = nextQQPreview(null, 0);
  for (const time of [2_000, 4_000, 6_000, 8_000]) state = nextQQPreview(state.timing, time);
  assert.equal(state.expiresAt, 10_000);
  state = nextQQPreview(state.timing, 10_001);
  assert.equal(state.expiresAt, null);
  assert.equal(nextQQPreview(state.timing, 12_000).expiresAt, null);
});

test("a message after a quiet interval starts a new preview burst", () => {
  const state = nextQQPreview(null, 0);
  assert.deepEqual(nextQQPreview(state.timing, 6_000), {
    timing: { burstStartedAt: 6_000, lastArrivalAt: 6_000 }, expiresAt: 11_000,
  });
});
