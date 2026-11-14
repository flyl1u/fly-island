import assert from "node:assert/strict";
import test from "node:test";
import { DETACHED_SETTINGS_STORAGE_KEY, isFreshPositionReset, loadDetachedSettings, parsePanelPreview } from "../../src/windows/settings/storage.ts";

test("settings default to a separate window and keep an explicit embedded preference", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: key => values.get(key) ?? null } } });
  try {
    assert.equal(loadDetachedSettings(), true);
    values.set(DETACHED_SETTINGS_STORAGE_KEY, "false");
    assert.equal(loadDetachedSettings(), false);
    values.set(DETACHED_SETTINGS_STORAGE_KEY, "true");
    assert.equal(loadDetachedSettings(), true);
    values.set(DETACHED_SETTINGS_STORAGE_KEY, "broken");
    assert.equal(loadDetachedSettings(), true);
    Object.defineProperty(globalThis, "window", { configurable: true, get: () => { throw new Error("Storage unavailable"); } });
    assert.equal(loadDetachedSettings(), true);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
});

test("panel preview requests are read only while fresh and well formed", () => {
  const now = 10_000;
  const request = (mode, requestedAt = now - 100) => JSON.stringify({ mode, requestedAt });

  assert.equal(parsePanelPreview(request("expanded"), now), "expanded");
  assert.equal(parsePanelPreview(request("collapsed"), now), "collapsed");
  // A request left over from an earlier session must not open the island.
  assert.equal(parsePanelPreview(request("expanded", now - 5_000), now), null);
  assert.equal(parsePanelPreview(request("tucked"), now), "tucked");
  assert.equal(parsePanelPreview(JSON.stringify({ mode: "expanded" }), now), null);
  assert.equal(parsePanelPreview("{broken", now), null);
  assert.equal(parsePanelPreview(null, now), null);
});

test("position reset requests count only while fresh and well formed", () => {
  const now = 10_000;
  assert.equal(isFreshPositionReset(JSON.stringify({ requestedAt: now - 100 }), now), true);
  // A request left over from an earlier session must not move the island.
  assert.equal(isFreshPositionReset(JSON.stringify({ requestedAt: now - 6_000 }), now), false);
  assert.equal(isFreshPositionReset(JSON.stringify({}), now), false);
  assert.equal(isFreshPositionReset("{broken", now), false);
  assert.equal(isFreshPositionReset(null, now), false);
});
