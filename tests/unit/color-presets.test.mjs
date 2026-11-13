import assert from "node:assert/strict";
import test from "node:test";
import { addColorPreset, MAX_COLOR_PRESETS, normalizeColorPresets, removeColorPreset } from "../../src/features/appearance/colorPresets.ts";
import { COLOR_PRESETS_KEY, loadColorPresets, saveColorPresets } from "../../src/features/appearance/storage.ts";

const colors = { islandBackgroundColor: "#2f2f37", taskTextColor: "#ffffff", pulseColor: "#3ae489" };
const palette = index => ({ ...colors, islandBackgroundColor: `#10203${index}` });
function withStorage(run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map();
  let blocked = false;
  const localStorage = {
    getItem(key) { if (blocked) throw Error("blocked"); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw Error("quota"); values.set(key, value); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  try { run(values, () => { blocked = true; }); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
}

test("presets add canonical colors, deduplicate by all three colors ignoring case, and delete by id", () => {
  const first = addColorPreset([], colors, "one");
  assert.deepEqual(first, [{ id: "one", islandBackgroundColor: "#2F2F37", taskTextColor: "#FFFFFF", pulseColor: "#3AE489" }]);
  assert.equal(addColorPreset(first, { ...colors, pulseColor: "#3AE489" }, "duplicate"), first);
  assert.equal(addColorPreset(first, palette(1), "one"), first);
  assert.equal(addColorPreset(first, palette(1), " "), first);
  assert.equal(addColorPreset(first, { ...colors, pulseColor: "#fff" }, "invalid"), first);
  const second = addColorPreset(first, { ...colors, taskTextColor: "#aabbcc" }, "two");
  assert.equal(second.length, 2);
  assert.deepEqual(removeColorPreset(second, "one"), [second[1]]);
  assert.deepEqual(removeColorPreset(second, "missing"), second);
});

test("eight presets is the limit, and deletion makes room again", () => {
  let presets = [];
  for (let index = 0; index < MAX_COLOR_PRESETS; index++) presets = addColorPreset(presets, palette(index), String(index));
  assert.equal(presets.length, 8);
  assert.equal(addColorPreset(presets, palette(8), "ninth"), presets);
  presets = removeColorPreset(presets, "0");
  assert.equal(addColorPreset(presets, palette(8), "ninth").length, 8);
});

test("loading skips invalid records, duplicate ids/colors, caps at eight, and treats corrupt data as empty", () => {
  for (const value of [null, {}, "bad", 42]) assert.deepEqual(normalizeColorPresets(value), []);
  const entries = [null, {}, { id: "", ...colors }, { id: "bad", ...colors, pulseColor: "red" },
    { id: "one", ...colors }, { id: "one", ...palette(1) }, { id: "duplicate", ...colors }];
  assert.equal(normalizeColorPresets(entries).length, 1);
  assert.equal(normalizeColorPresets(Array.from({ length: 10 }, (_, index) => ({ id: String(index), ...palette(index) }))).length, 8);
  withStorage((values, block) => {
    values.set("focusd-island-setting-presets", "retired");
    assert.deepEqual(loadColorPresets(), []);
    values.set(COLOR_PRESETS_KEY, "{broken");
    assert.deepEqual(loadColorPresets(), []);
    assert.equal(saveColorPresets(addColorPreset([], colors, "one")), true);
    assert.equal(loadColorPresets()[0].islandBackgroundColor, "#2F2F37");
    assert.equal(values.get("focusd-island-setting-presets"), "retired");
    block();
    assert.deepEqual(loadColorPresets(), []);
    assert.equal(saveColorPresets([]), false);
  });
});
