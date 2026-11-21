import test from "node:test";
import assert from "node:assert/strict";
import {
  DISABLED_NATIVE_PLUGINS_KEY, NATIVE_PLUGINS_KEY, loadNativePluginStates,
  normalizeNativePluginStates, saveNativePluginEnabled, saveNativePluginInstalled,
} from "../../src/features/plugins/native/storage.ts";

function mockStorage(t, entries) {
  const values = new Map(entries);
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    },
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  return values;
}

test("existing installs are enabled unless a known installed id is disabled", () => {
  const installed = ["clockWeather", "dingtalk", "clockWeather", "unknown", null];
  assert.deepEqual(normalizeNativePluginStates(installed).enabled, normalizeNativePluginStates(installed).installed);
  const state = normalizeNativePluginStates(installed, ["clockWeather", "clockWeather", "zcode", "unknown", 1]);
  assert.equal(state.installed.clockWeather, true);
  assert.equal(state.enabled.clockWeather, false);
  assert.equal(state.enabled.dingtalk, true);
  assert.equal(state.enabled.zcode, false);
  assert.equal(Object.hasOwn(state.enabled, "unknown"), false);
  assert.ok(Object.values(normalizeNativePluginStates({}, []).enabled).every((value) => value === false));
});

test("toggling a plugin writes only the disabled list and leaves other installed plugins enabled", (t) => {
  const installed = JSON.stringify(["clockWeather", "dingtalk"]);
  const values = mockStorage(t, [[NATIVE_PLUGINS_KEY, installed], [DISABLED_NATIVE_PLUGINS_KEY, "{broken"]]);
  assert.equal(loadNativePluginStates().enabled.clockWeather, true);
  assert.equal(saveNativePluginEnabled("zcode", false), false);
  assert.equal(saveNativePluginEnabled("clockWeather", false), true);
  assert.equal(saveNativePluginEnabled("clockWeather", false), true);
  assert.equal(values.get(NATIVE_PLUGINS_KEY), installed);
  assert.equal(values.get(DISABLED_NATIVE_PLUGINS_KEY), '["clockWeather"]');
  assert.equal(loadNativePluginStates().enabled.dingtalk, true);
  assert.equal(loadNativePluginStates().enabled.clockWeather, false);
  assert.equal(saveNativePluginEnabled("clockWeather", true), true);
  assert.equal(loadNativePluginStates().enabled.clockWeather, true);
});

test("uninstall clears the marker and install also clears any stale marker for that id", (t) => {
  const values = mockStorage(t, [
    [NATIVE_PLUGINS_KEY, '["clockWeather","dingtalk"]'],
    [DISABLED_NATIVE_PLUGINS_KEY, '["clockWeather","dingtalk"]'],
  ]);
  assert.equal(saveNativePluginInstalled("clockWeather", false), true);
  assert.equal(loadNativePluginStates().installed.clockWeather, false);
  assert.equal(values.get(DISABLED_NATIVE_PLUGINS_KEY), '["dingtalk"]');

  values.set(DISABLED_NATIVE_PLUGINS_KEY, '["dingtalk","clockWeather"]');
  assert.equal(saveNativePluginInstalled("clockWeather", true), true);
  assert.equal(loadNativePluginStates().enabled.clockWeather, true);
  assert.equal(loadNativePluginStates().enabled.dingtalk, false);
  assert.equal(values.get(NATIVE_PLUGINS_KEY), '["dingtalk","clockWeather"]');
  assert.equal(values.get(DISABLED_NATIVE_PLUGINS_KEY), '["dingtalk"]');
});
