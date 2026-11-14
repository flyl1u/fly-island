import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/features/appearance/settings.ts";
import { idlePlan } from "../../src/windows/island/idleCollapse.ts";

const settings = (patch) => ({ autoTuck: true, tuckDelaySeconds: 30, autoCollapseSeconds: 30, ...patch });

test("defaults: the open island collapses 30 s after the cursor leaves, the collapsed one tucks after 30 s", () => {
  assert.equal(DEFAULT_SETTINGS.autoCollapseSeconds, 30);
  assert.equal(DEFAULT_SETTINGS.tuckDelaySeconds, 30);
  assert.deepEqual(idlePlan("expanded", DEFAULT_SETTINGS, false), { seconds: 30, action: "collapse" });
  assert.deepEqual(idlePlan("collapsed", DEFAULT_SETTINGS, false), { seconds: 30, action: "tuck" });
});

test("(A) only ever collapses the open island, whatever (B) is", () => {
  assert.deepEqual(idlePlan("expanded", settings({ autoCollapseSeconds: 45, tuckDelaySeconds: 10 }), false), { seconds: 45, action: "collapse" });
  assert.deepEqual(idlePlan("expanded", settings({ autoCollapseSeconds: 7 }), false), { seconds: 7, action: "collapse" });
  assert.deepEqual(idlePlan("expanded", settings({ autoTuck: false, autoCollapseSeconds: 30 }), false), { seconds: 30, action: "collapse" });
});

test("(A) waits while the cursor is on the open island", () => {
  assert.equal(idlePlan("expanded", settings({}), false, true), null);
  assert.deepEqual(idlePlan("collapsed", settings({}), false, true), { seconds: 30, action: "tuck" });
});

test("(B) follows its own delay, and only with tucking on", () => {
  assert.deepEqual(idlePlan("collapsed", settings({ tuckDelaySeconds: 90, autoCollapseSeconds: 5 }), false), { seconds: 90, action: "tuck" });
  assert.equal(idlePlan("collapsed", settings({ autoTuck: false }), false), null);
});

test("0 keeps the open island open; a message preview holds the collapsed island's timer", () => {
  assert.equal(idlePlan("expanded", settings({ autoCollapseSeconds: 0 }), false), null);
  assert.equal(idlePlan("collapsed", settings({}), true), null);
});

test("typed-in delays are rounded and kept in range, and older settings keep what they did", () => {
  assert.equal(normalizeSettings({ autoTuck: true, autoCollapseSeconds: 7 }).autoCollapseSeconds, 7);
  assert.equal(normalizeSettings({ autoTuck: true, autoCollapseSeconds: 12.6 }).autoCollapseSeconds, 13);
  assert.equal(normalizeSettings({ autoTuck: true, autoCollapseSeconds: 0 }).autoCollapseSeconds, 0);
  assert.equal(normalizeSettings({ autoTuck: true, autoCollapseSeconds: 9999 }).autoCollapseSeconds, 600);
  assert.equal(normalizeSettings({ autoTuck: true, autoCollapseSeconds: -4 }).autoCollapseSeconds, 0);
  assert.equal(normalizeSettings({ autoTuck: true, autoCollapseSeconds: "10" }).autoCollapseSeconds, 30);
  // Before (A) was a setting, a panel closed only when the island tucked after idling.
  assert.equal(normalizeSettings({ autoTuck: true }).autoCollapseSeconds, 30);
  assert.equal(normalizeSettings({ autoTuck: false }).autoCollapseSeconds, 0);
  assert.equal(normalizeSettings({}).autoCollapseSeconds, 30);
  assert.equal(normalizeSettings({ tuckDelaySeconds: 45 }).tuckDelaySeconds, 45);
  assert.equal(normalizeSettings({ tuckDelaySeconds: 1 }).tuckDelaySeconds, 3);
  // autoTuckSeconds was saved by older versions that hid the setting; it is not read back.
  assert.equal(normalizeSettings({ autoTuckSeconds: 90 }).tuckDelaySeconds, 30);
});
