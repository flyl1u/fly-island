import assert from "node:assert/strict";
import test from "node:test";
import { nextQQPreview } from "../../src/features/messages/qqNotificationTiming.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

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

test("a configured ten-second preview merges arrivals with a twenty-second burst limit", () => {
  let state = nextQQPreview(null, 0, 10);
  assert.equal(state.expiresAt, 10_000);
  state = nextQQPreview(state.timing, 9_000, 10);
  assert.equal(state.expiresAt, 19_000);
  state = nextQQPreview(state.timing, 10_000, 10);
  assert.equal(state.expiresAt, 20_000);
  state = nextQQPreview(state.timing, 19_999, 10);
  assert.equal(state.expiresAt, 20_000);
  state = nextQQPreview(state.timing, 20_000, 10);
  assert.equal(state.expiresAt, null);
  assert.equal(nextQQPreview(state.timing, 30_000, 10).expiresAt, null);
  assert.equal(nextQQPreview(state.timing, 30_001, 10).expiresAt, 40_001);
});

test("both duration limits use the same burst and quiet-interval rules", () => {
  for (const seconds of [3, 30]) {
    const ms = seconds * 1000;
    const start = nextQQPreview(null, 100, seconds);
    assert.equal(start.expiresAt, 100 + ms);
    const merged = nextQQPreview(start.timing, 100 + ms, seconds);
    assert.equal(merged.timing.burstStartedAt, 100);
    assert.equal(merged.expiresAt, 100 + 2 * ms);
    const separate = nextQQPreview(start.timing, 101 + ms, seconds);
    assert.equal(separate.expiresAt, 101 + 2 * ms);
  }
});

test("preview duration persists as whole seconds and old/invalid settings keep five seconds", () => {
  assert.equal(normalizeSettings({ messagePreviewSeconds: 10 }).messagePreviewSeconds, 10);
  assert.equal(normalizeSettings({ messagePreviewSeconds: 2 }).messagePreviewSeconds, 3);
  assert.equal(normalizeSettings({ messagePreviewSeconds: 99 }).messagePreviewSeconds, 30);
  assert.equal(normalizeSettings({ messagePreviewSeconds: 10.6 }).messagePreviewSeconds, 11);
  for (const value of [undefined, null, "10", NaN, Infinity]) {
    assert.equal(normalizeSettings({ messagePreviewSeconds: value }).messagePreviewSeconds, 5);
  }
});
