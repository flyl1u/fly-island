import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

test("new notification and reminder options are opt-in for old and invalid settings", () => {
  for (const key of ["messageAutoExpand", "gameShowNotices", "todoTimerReminder", "todoTimerReminderSound"]) {
    for (const value of [undefined, null, "true", 1, {}, false]) {
      assert.equal(normalizeSettings({ [key]: value })[key], false, key);
    }
    assert.equal(normalizeSettings({ [key]: true })[key], true, key);
  }
});

test("notice size and duration settings clamp and recover from invalid values", () => {
  for (const [key, min, max, fallback] of [
    ["messageExpandMaxWidth", 320, 720, 520], ["messageExpandMaxHeight", 80, 360, 180],
    ["messageExpandSeconds", 3, 60, 12], ["gameNoticeSeconds", 2, 30, 4],
  ]) {
    for (const value of [undefined, null, "12", NaN, Infinity]) {
      assert.equal(normalizeSettings({ [key]: value })[key], fallback, key);
    }
    assert.equal(normalizeSettings({ [key]: -10 })[key], min, key);
    assert.equal(normalizeSettings({ [key]: 1000 })[key], max, key);
  }
});
