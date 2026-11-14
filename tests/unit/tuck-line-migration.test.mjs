import assert from "node:assert/strict";
import test from "node:test";
import { migrateTuckLine } from "../../src/features/appearance/tuckLineMigration.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/features/appearance/settings.ts";
import { loadSettings, STORAGE_KEY, TUCK_LINE_MIGRATION_KEY } from "../../src/features/appearance/storage.ts";

test("each saved style migrates once, in write-before-marker order", () => {
  for (const tuckStyle of ["edge", "hidden", "line"]) {
    const writes = [];
    const next = migrateTuckLine({ ...DEFAULT_SETTINGS, tuckStyle }, true, {
      completed: false,
      saveSettings: value => { writes.push(value.tuckStyle); return true; },
      markComplete: () => { writes.push("done"); return true; },
    });
    assert.equal(next.tuckStyle, "line");
    assert.deepEqual(writes, ["line", "done"]);
    const chosen = { ...next, tuckStyle: "hidden" };
    assert.equal(migrateTuckLine(chosen, true, {
      completed: true, saveSettings: () => assert.fail(), markComplete: () => assert.fail(),
    }), chosen);
  }
});

test("new users only get the completion marker", () => {
  let marked = false;
  assert.equal(migrateTuckLine(DEFAULT_SETTINGS, false, {
    completed: false, saveSettings: () => assert.fail(), markComplete: () => (marked = true),
  }), DEFAULT_SETTINGS);
  assert.equal(marked, true);
});

test("failed settings or marker writes are retried next load", () => {
  const chosen = { ...DEFAULT_SETTINGS, tuckStyle: "edge" };
  let completed = false;
  let saved = chosen;
  let canSave = false;
  let canMark = false;
  const migrate = () => migrateTuckLine(saved, true, {
    completed,
    saveSettings: next => { if (!canSave) return false; saved = next; return true; },
    markComplete: () => { if (!canMark) return false; completed = true; return true; },
  });
  assert.equal(migrate(), chosen);
  assert.equal(completed, false);
  canSave = true;
  assert.equal(migrate().tuckStyle, "line");
  assert.equal(completed, false);
  canMark = true;
  migrate();
  assert.equal(completed, true);
});

test("storage integration preserves a later manual choice", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map([[STORAGE_KEY, JSON.stringify({ tuckStyle: "hidden" })]]);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } } });
  try {
    assert.equal(loadSettings().tuckStyle, "line");
    assert.equal(values.get(TUCK_LINE_MIGRATION_KEY), "1");
    values.set(STORAGE_KEY, JSON.stringify({ ...loadSettings(), tuckStyle: "edge" }));
    assert.equal(loadSettings().tuckStyle, "edge");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
});

test("missing or invalid autoTuck falls back to its true default", () => {
  for (const value of [undefined, null, "false", 0, {}]) {
    const next = normalizeSettings({ autoTuck: value });
    assert.equal(next.autoTuck, true);
    assert.equal(next.autoCollapseSeconds, 30);
  }
  assert.equal(normalizeSettings({ autoTuck: false }).autoTuck, false);
  assert.equal(normalizeSettings({ autoTuck: false }).autoCollapseSeconds, 0);
});
