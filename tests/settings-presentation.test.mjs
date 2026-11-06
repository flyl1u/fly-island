import assert from "node:assert/strict";
import test from "node:test";
import { loadDetachedSettings, saveDetachedSettings, requestSettingsFocus, takeFocusRequest, DETACHED_SETTINGS_STORAGE_KEY } from "../src/windows/settings/storage.ts";

function withStorage(entries, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map(entries);
  const target = new EventTarget();
  target.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  try { run(values, target); }
  finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
}

test("upgrading existing data defaults to embedded settings and only stores the presentation choice", () => {
  const existing = [
    ["focusd-island-settings", '{"appearanceMode":"liquidGlass","opacity":83}'],
    ["focusd-island-todos", '[{"id":"existing","title":"Keep this task"}]'],
    ["focusd-island-daily-note", "Keep my note"],
    ["focusd-island-archives", '[{"date":"2026-11-01"}]'],
    ["focusd-island-setting-presets", '[{"id":"my-preset"}]'],
    ["focusd-island-save-directory", "D:\u005cNotes"],
  ];
  withStorage(existing, (values) => {
    assert.equal(loadDetachedSettings(), false);
    assert.deepEqual([...values], existing);
    assert.equal(saveDetachedSettings(true), true);
    assert.equal(loadDetachedSettings(), true);
    assert.equal(values.get(DETACHED_SETTINGS_STORAGE_KEY), "true");
    assert.equal(saveDetachedSettings(false), true);
    assert.equal(loadDetachedSettings(), false);
    for (const [key, value] of existing) assert.equal(values.get(key), value);
  });
});

test("save-directory focus works repeatedly in the same window", () => {
  withStorage([], (_values, target) => {
    let focusCount = 0;
    target.addEventListener("settings-focus-changed", () => {
      assert.equal(takeFocusRequest(), "savePath"); focusCount++;
    });
    requestSettingsFocus("savePath");
    requestSettingsFocus("savePath");
    assert.equal(focusCount, 2);
    assert.equal(takeFocusRequest(), null);
  });
});

test("unavailable storage leaves the presentation unchanged without throwing", () => {
  withStorage([], (_values, target) => {
    target.localStorage.setItem = () => { throw new Error("Quota exceeded"); };
    assert.equal(saveDetachedSettings(true), false);
    assert.equal(loadDetachedSettings(), false);
  });
});
