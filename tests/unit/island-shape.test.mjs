import assert from "node:assert/strict";
import test from "node:test";
import { CAPSULE_SHAPE_ENABLED, CAPSULE_TOP_GAP, shapedSettings } from "../../src/features/appearance/islandShape.ts";
import { normalizeSettings, withAppearanceFrom } from "../../src/features/appearance/settings.ts";

const capsule = (fields = {}) => ({ ...normalizeSettings(null), islandShape: "capsule", ...fields });

test("saved settings without a shape keep the notch; a saved capsule only while it is offered", () => {
  assert.equal(normalizeSettings(null).islandShape, "notch");
  assert.equal(normalizeSettings({ islandShape: "pill" }).islandShape, "notch");
  assert.equal(normalizeSettings({ islandShape: "capsule" }).islandShape, CAPSULE_SHAPE_ENABLED ? "capsule" : "notch");
});

test("the notch draws the user's own settings", () => {
  const settings = normalizeSettings({ marginY: 0, collapsedCornerRadius: 12 });
  assert.equal(shapedSettings(settings), settings);
});

test("the capsule floats below the top edge as a full pill", () => {
  const shaped = shapedSettings(capsule({ collapsedHeight: 44, collapsedCornerRadius: 12 }));
  assert.equal(shaped.marginY, CAPSULE_TOP_GAP);
  assert.equal(shaped.collapsedCornerRadius, 22);
  assert.equal(shapedSettings(capsule({ marginY: 30 })).marginY, 30, "a larger saved margin is kept");
});

test("the shape travels with appearance presets", () => {
  assert.equal(withAppearanceFrom(normalizeSettings(null), capsule()).islandShape, "capsule");
});
