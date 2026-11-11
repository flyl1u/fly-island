import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/features/appearance/settings.ts";
import { idlePlan } from "../../src/windows/island/idleCollapse.ts";

const settings = (patch) => ({ autoTuck: true, autoTuckSeconds: 30, autoCollapseSeconds: 30, ...patch });

test("by default an open panel tucks after 30 idle seconds, as before the setting", () => {
  assert.equal(DEFAULT_SETTINGS.autoCollapseSeconds, DEFAULT_SETTINGS.autoTuckSeconds);
  assert.deepEqual(idlePlan("expanded", DEFAULT_SETTINGS, false), { seconds: 30, action: "tuck" });
  assert.deepEqual(idlePlan("collapsed", DEFAULT_SETTINGS, false), { seconds: 30, action: "tuck" });
});

test("a shorter delay only collapses the panel; the collapsed island tucks later", () => {
  assert.deepEqual(idlePlan("expanded", settings({ autoCollapseSeconds: 5 }), false), { seconds: 5, action: "collapse" });
  assert.deepEqual(idlePlan("collapsed", settings({ autoCollapseSeconds: 5 }), false), { seconds: 30, action: "tuck" });
});

test("with tucking off the panel still collapses after its delay, and the collapsed island stays", () => {
  assert.deepEqual(idlePlan("expanded", settings({ autoTuck: false, autoCollapseSeconds: 30 }), false), { seconds: 30, action: "collapse" });
  assert.equal(idlePlan("collapsed", settings({ autoTuck: false }), false), null);
});

test("never keeps an open panel open; a message preview holds the collapsed island's timer", () => {
  assert.equal(idlePlan("expanded", settings({ autoCollapseSeconds: 0 }), false), null);
  assert.equal(idlePlan("collapsed", settings({}), true), null);
});

test("the delay is read back within its choices, and older settings keep what they did", () => {
  assert.equal(normalizeSettings({ autoTuck: true, autoCollapseSeconds: 10 }).autoCollapseSeconds, 10);
  assert.equal(normalizeSettings({ autoTuck: true, autoCollapseSeconds: 0 }).autoCollapseSeconds, 0);
  assert.equal(normalizeSettings({ autoTuck: true, autoCollapseSeconds: 7 }).autoCollapseSeconds, 30);
  // Before the setting, a panel closed only when the island tucked after idling.
  assert.equal(normalizeSettings({ autoTuck: true }).autoCollapseSeconds, 30);
  assert.equal(normalizeSettings({ autoTuck: false }).autoCollapseSeconds, 0);
  assert.equal(normalizeSettings({}).autoCollapseSeconds, 0);
});
