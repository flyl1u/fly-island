import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings, withAppearanceFrom } from "../../src/features/appearance/settings.ts";

test("top edge curves are optional, finite and bounded", () => {
  assert.equal(DEFAULT_SETTINGS.topEdgeShoulders, false);
  assert.equal(DEFAULT_SETTINGS.topEdgeShoulderSize, 10);
  for (const value of [undefined, null, "true", 1]) {
    assert.equal(normalizeSettings({ topEdgeShoulders: value }).topEdgeShoulders, false);
  }
  assert.equal(normalizeSettings({ topEdgeShoulders: true }).topEdgeShoulders, true);
  for (const value of [undefined, null, "20", NaN, Infinity]) {
    assert.equal(normalizeSettings({ topEdgeShoulderSize: value }).topEdgeShoulderSize, 10);
  }
  for (const [value, expected] of [[-1, 4], [4, 4], [12.6, 13], [21, 20]]) {
    assert.equal(normalizeSettings({ topEdgeShoulderSize: value }).topEdgeShoulderSize, expected);
  }
  const reset = withAppearanceFrom({ ...DEFAULT_SETTINGS, topEdgeShoulders: true, topEdgeShoulderSize: 20 }, DEFAULT_SETTINGS);
  assert.equal(reset.topEdgeShoulders, false);
  assert.equal(reset.topEdgeShoulderSize, 10);
});
