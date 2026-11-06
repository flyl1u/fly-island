import assert from "node:assert/strict";
import test from "node:test";
import { TRANSLATIONS } from "../../src/i18n/index.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/features/appearance/settings.ts";

test("the volume and brightness popup is on by default and only an explicit false turns it off", () => {
  assert.equal(DEFAULT_SETTINGS.levelPopup, true);
  assert.equal(normalizeSettings({}).levelPopup, true);
  assert.equal(normalizeSettings({ levelPopup: false }).levelPopup, false);
});

test("the popup names the level in both languages", () => {
  assert.equal(TRANSLATIONS["zh-CN"].island.levelPopup.volume(42), "音量 42%");
  assert.equal(TRANSLATIONS.en.island.levelPopup.brightness(70), "Brightness 70%");
});
