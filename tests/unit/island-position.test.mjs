import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings, withAppearanceFrom } from "../../src/features/appearance/settings.ts";

test("position locking is opt-in and survives reading saved settings", () => {
  assert.equal(DEFAULT_SETTINGS.positionLocked, false);
  for (const saved of [undefined, null, {}, { positionLocked: false }, { positionLocked: "true" }, { positionLocked: 1 }]) {
    assert.equal(normalizeSettings(saved).positionLocked, false);
  }
  assert.equal(normalizeSettings({ positionLocked: true }).positionLocked, true);
});

test("resetting the appearance preserves the position lock", () => {
  const locked = { ...DEFAULT_SETTINGS, positionLocked: true, opacity: 65 };
  const reset = withAppearanceFrom(locked, DEFAULT_SETTINGS);
  assert.equal(reset.positionLocked, true);
  assert.equal(reset.opacity, DEFAULT_SETTINGS.opacity);
});
