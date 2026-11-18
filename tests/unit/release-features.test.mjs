import test from "node:test";
import assert from "node:assert/strict";
import { PLUGINS_ENABLED, MAIL_OTP_ENABLED } from "../../src/features/releaseFlags.ts";
import { SETTINGS_CATEGORIES, SETTINGS_GROUPS, settingsCategoryFor } from "../../src/windows/settings/categories.ts";
import { isPageEnabled, resolveMessageSource } from "../../src/windows/island/features.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

test("unavailable runtime features preserve choices and expose the plugin guide route", () => {
  assert.equal(MAIL_OTP_ENABLED, false);
  assert.equal(PLUGINS_ENABLED, false);
  assert.equal(SETTINGS_CATEGORIES.includes("plugins"), true);
  assert.equal(SETTINGS_GROUPS.some((group) => group.categories.includes("plugins")), true);
  assert.equal(settingsCategoryFor("plugins"), "plugins");
  const features = { todo: false, music: false, clipboard: false, shelf: false,
    agents: false, translation: false, qq: false, wechat: false, qqMail: false, plugin: true };
  assert.equal(isPageEnabled("qq", features), false);
  assert.equal(resolveMessageSource("plugin", { ...features, wechat: true }), "wechat");
  assert.equal(resolveMessageSource("plugin", features), "qqMail");
  for (const autoCopyOtp of [true, false]) {
    assert.equal(normalizeSettings({ autoCopyOtp }).autoCopyOtp, autoCopyOtp);
  }
});
