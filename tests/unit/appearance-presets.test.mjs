import assert from "node:assert/strict";
import test from "node:test";
import {
  addAppearancePreset,
  applyAppearancePreset,
  MAX_APPEARANCE_PRESETS,
  normalizeAppearancePresets,
  removeAppearancePreset,
  snapshotAppearance,
} from "../../src/features/appearance/appearancePresets.ts";
import { APPEARANCE_SETTING_KEYS } from "../../src/features/appearance/settings.ts";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settingsDefaults.ts";

test("a saved preset keeps exactly the appearance settings, under a trimmed short name", () => {
  const presets = addAppearancePreset([], "  深色玻璃面板名称很长很长很长很长很长很长很长很长很长  ", { ...DEFAULT_SETTINGS, pageTextColor: "#112233" }, "id-1");
  assert.equal(presets.length, 1);
  assert.equal(presets[0].name.length, 20);
  assert.deepEqual(Object.keys(presets[0].settings).sort(), [...APPEARANCE_SETTING_KEYS].sort());
  assert.equal(presets[0].settings.pageTextColor, "#112233");
});

test("an empty name or a full list adds nothing and returns the same list", () => {
  const presets = addAppearancePreset([], "x", DEFAULT_SETTINGS, "a");
  assert.equal(addAppearancePreset(presets, "   ", DEFAULT_SETTINGS, "b"), presets);
  let full = [];
  for (let index = 0; index < MAX_APPEARANCE_PRESETS; index += 1) {
    full = addAppearancePreset(full, `p${index}`, DEFAULT_SETTINGS, `id-${index}`);
  }
  assert.equal(full.length, MAX_APPEARANCE_PRESETS);
  assert.equal(addAppearancePreset(full, "more", DEFAULT_SETTINGS, "extra"), full);
});

test("applying a preset changes only the appearance; todo and agent settings stay", () => {
  const saved = addAppearancePreset([], "saved", { ...DEFAULT_SETTINGS, pageTextColor: "#ABCDEF" }, "p")[0];
  const current = { ...DEFAULT_SETTINGS, agentRemindSeconds: 77, pageTextColor: "" };
  const next = applyAppearancePreset(current, saved);
  assert.equal(next.pageTextColor, "#ABCDEF");
  assert.equal(next.agentRemindSeconds, 77);
});

test("stored presets tolerate damage: bad records, duplicate ids and non-arrays are dropped", () => {
  assert.deepEqual(normalizeAppearancePresets("{broken"), []);
  assert.deepEqual(normalizeAppearancePresets(null), []);
  const good = { id: "a", name: "ok", settings: snapshotAppearance(DEFAULT_SETTINGS) };
  const result = normalizeAppearancePresets([
    good,
    { ...good, id: "a" },
    { id: "b", name: "", settings: {} },
    { id: "c", name: "no settings" },
    null,
    "text",
  ]);
  assert.deepEqual(result.map((preset) => preset.id), ["a"]);
});

test("removing a preset keeps the others in order", () => {
  let presets = [];
  for (const id of ["a", "b", "c"]) presets = addAppearancePreset(presets, id, DEFAULT_SETTINGS, id);
  assert.deepEqual(removeAppearancePreset(presets, "b").map((preset) => preset.id), ["a", "c"]);
});
