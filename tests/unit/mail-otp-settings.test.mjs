import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

test("OTP auto-copy defaults on for old settings and preserves explicit boolean choices", () => {
  for (const autoCopyOtp of [undefined, null, 0, 1, "false", {}, []]) {
    assert.equal(normalizeSettings({ autoCopyOtp }).autoCopyOtp, true);
  }
  assert.equal(normalizeSettings(null).autoCopyOtp, true);
  assert.equal(normalizeSettings({ autoCopyOtp: false }).autoCopyOtp, false);
  assert.equal(normalizeSettings({ autoCopyOtp: true }).autoCopyOtp, true);
});
