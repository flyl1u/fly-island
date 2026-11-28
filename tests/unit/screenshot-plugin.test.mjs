import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScreenshotSettings, DEFAULT_SCREENSHOT_SETTINGS, SCREENSHOT_SETTINGS_KEY, loadScreenshotSettings, saveScreenshotSettings } from "../../src/features/screenshot/storage.ts";
import { normalizeNativePluginStates, saveNativePluginInstalled, saveNativePluginEnabled, NATIVE_PLUGINS_KEY } from "../../src/features/plugins/native/storage.ts";

test("missing or corrupted screenshot settings retain safe defaults", () => {
  for (const input of [null, [], 42, "invalid", { shortcut: " ", shortcutEnabled: 0, showHints: "false" }]) {
    assert.deepEqual(normalizeScreenshotSettings(input), DEFAULT_SCREENSHOT_SETTINGS);
  }
  assert.deepEqual(normalizeScreenshotSettings({ shortcut: " Ctrl+Shift+F9 ", showMagnifier: false, windowSnapping: false, showHints: false, recording: true }),
    { ...DEFAULT_SCREENSHOT_SETTINGS, shortcut: "Ctrl+Shift+F9", showMagnifier: false, windowSnapping: false, showHints: false });
});
test("screenshot installation and enable flags are independent of other plugins and preserve preferences", (t) => {
  const values = new Map([[NATIVE_PLUGINS_KEY, '["clockWeather"]']]);
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  assert.equal(normalizeNativePluginStates(["clockWeather"]).enabled.screenshot, false);
  assert.equal(saveScreenshotSettings({ ...DEFAULT_SCREENSHOT_SETTINGS, shortcut: "Ctrl+Shift+F9" }), true);
  assert.equal(saveNativePluginInstalled("screenshot", true), true);
  assert.equal(saveNativePluginEnabled("screenshot", false), true);
  assert.equal(saveNativePluginInstalled("screenshot", false), true);
  assert.equal(values.get(NATIVE_PLUGINS_KEY), '["clockWeather"]');
  assert.equal(saveNativePluginInstalled("screenshot", true), true);
  assert.equal(loadScreenshotSettings().shortcut, "Ctrl+Shift+F9");
  values.set(SCREENSHOT_SETTINGS_KEY, "{invalid");
  assert.deepEqual(loadScreenshotSettings(), DEFAULT_SCREENSHOT_SETTINGS);
});
