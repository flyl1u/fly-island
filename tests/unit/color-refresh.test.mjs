import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings.ts";
import { colorsFrom } from "../../src/features/appearance/colorPalette.ts";
import {
  COLOR_BACKUP_KEY, COLOR_REFRESH_KEY, COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY, SESSION_SORT_MIGRATION_KEY,
  STORAGE_KEY, loadSettings, loadColorBackup, saveSettings, swapColorBackup, withColorBackup,
} from "../../src/features/appearance/storage.ts";

const old = { islandBackgroundColor: "#102030", taskTextColor: "#aabbcc", pulseColor: "#abcdef" };
const defaults = { islandBackgroundColor: "#2F2F37", taskTextColor: "#FFFFFF", pulseColor: "#3AE489" };
function withStorage(entries, run, intercept = () => {}) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map(entries);
  const writes = [];
  const localStorage = {
    getItem(key) { const value = values.get(key) ?? null; intercept("get", key, values); return value; },
    setItem(key, value) { intercept("set", key, values); writes.push(key); values.set(key, value); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  try { run(values, writes); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
}

test("refresh overrides every old palette once, writes backup before settings and marker, and keeps other settings", () => {
  withStorage([[STORAGE_KEY, JSON.stringify({ ...old, opacity: 75 })]], (values, writes) => {
    const next = loadSettings();
    assert.deepEqual(colorsFrom(next), defaults);
    assert.equal(next.opacity, 75);
    assert.deepEqual(loadColorBackup(), colorsFrom(old));
    assert.deepEqual(writes.slice(0, 3), [COLOR_BACKUP_KEY, STORAGE_KEY, COLOR_REFRESH_KEY]);
    assert.equal(values.get(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY), "1");
    const backup = values.get(COLOR_BACKUP_KEY);
    saveSettings({ ...next, pulseColor: "#998877" });
    assert.equal(loadSettings().pulseColor, "#998877");
    assert.equal(values.get(COLOR_BACKUP_KEY), backup);
  });
});

test("new users only get the marker; missing old background backs up the former black default", () => {
  withStorage([], (values) => {
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    assert.equal(values.get(COLOR_REFRESH_KEY), "1");
    assert.equal(values.has(COLOR_BACKUP_KEY), false);
    assert.equal(values.has(STORAGE_KEY), false);
  });
  withStorage([[STORAGE_KEY, "{}"]], () => {
    loadSettings();
    assert.equal(loadColorBackup().islandBackgroundColor, "#000000");
  });
});

test("old users already using the new defaults only get the marker, including mixed-case colors", () => {
  for (const palette of [defaults, { ...defaults, islandBackgroundColor: "#2f2F37", taskTextColor: "#ffffff", pulseColor: "#3ae489" }]) {
    const archive = JSON.stringify({ ...palette, opacity: 75 });
    withStorage([[STORAGE_KEY, archive], [COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY, "1"], [SESSION_SORT_MIGRATION_KEY, "1"]], (values, writes) => {
      const next = loadSettings();
      assert.deepEqual(colorsFrom(next), defaults);
      assert.equal(next.opacity, 75);
      assert.equal(values.get(STORAGE_KEY), archive);
      assert.equal(values.has(COLOR_BACKUP_KEY), false);
      assert.deepEqual(writes, [COLOR_REFRESH_KEY]);
      assert.equal(values.get(COLOR_REFRESH_KEY), "1");
      loadSettings();
      assert.deepEqual(writes, [COLOR_REFRESH_KEY]);
    });
  }
});

test("a second window completing migration during a settings read cannot return the old snapshot", () => {
  let nested = false;
  withStorage([[STORAGE_KEY, JSON.stringify(old)]], () => {
    assert.deepEqual(colorsFrom(loadSettings()), defaults);
    assert.deepEqual(loadColorBackup(), colorsFrom(old));
  }, (operation, key) => {
    if (operation === "get" && key === STORAGE_KEY && !nested) {
      nested = true;
      assert.deepEqual(colorsFrom(loadSettings()), defaults);
    }
  });
});

test("retry after a failed final marker never overwrites the original backup", () => {
  let failMarker = true;
  withStorage([[STORAGE_KEY, JSON.stringify(old)]], (values) => {
    loadSettings();
    assert.equal(values.has(COLOR_REFRESH_KEY), false);
    const backup = values.get(COLOR_BACKUP_KEY);
    failMarker = false;
    loadSettings();
    assert.equal(values.get(COLOR_REFRESH_KEY), "1");
    assert.equal(values.get(COLOR_BACKUP_KEY), backup);
  }, (operation, key) => { if (operation === "set" && key === COLOR_REFRESH_KEY && failMarker) throw Error("quota"); });
});

test("restore swaps the three colors repeatedly without changing other settings; bulk changes back up", () => {
  withStorage([[COLOR_BACKUP_KEY, JSON.stringify(old)]], () => {
    const current = { ...DEFAULT_SETTINGS, opacity: 75 };
    const restored = swapColorBackup(current);
    assert.deepEqual(colorsFrom(restored), colorsFrom(old));
    assert.equal(restored.opacity, 75);
    assert.deepEqual(loadColorBackup(), defaults);
    assert.deepEqual(swapColorBackup(restored), current);
    assert.deepEqual(withColorBackup(restored, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
    assert.deepEqual(loadColorBackup(), colorsFrom(old));
  });
});

test("corrupt archives and backups are empty; storage failures do not throw or discard unbacked colors", () => {
  for (const corrupt of ["{broken", "null", "[]", '"text"']) {
    withStorage([[STORAGE_KEY, corrupt], [COLOR_BACKUP_KEY, corrupt]], () => {
      assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
      assert.equal(loadColorBackup(), null);
      assert.deepEqual(swapColorBackup(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
    });
  }
  withStorage([[COLOR_BACKUP_KEY, JSON.stringify({ ...old, pulseColor: "#fff" })]], () => assert.equal(loadColorBackup(), null));
  withStorage([[STORAGE_KEY, JSON.stringify(old)]], (values) => {
    assert.deepEqual(colorsFrom(loadSettings()), colorsFrom(old));
    assert.equal(values.has(COLOR_REFRESH_KEY), false);
    assert.deepEqual(withColorBackup(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, pulseColor: "#123456" }), DEFAULT_SETTINGS);
  }, (operation) => { if (operation === "set") throw Error("blocked"); });
});

test("a saved session sort of status (the old default) moves to most recent first once", () => {
  withStorage([[STORAGE_KEY, JSON.stringify({ agentSessionSort: "status" })]], (values) => {
    assert.equal(loadSettings().agentSessionSort, "recent");
    assert.equal(JSON.parse(values.get(STORAGE_KEY)).agentSessionSort, "recent");
    assert.equal(values.get(SESSION_SORT_MIGRATION_KEY), "1");
    // Chosen again afterwards, it stays.
    saveSettings({ ...loadSettings(), agentSessionSort: "status" });
    assert.equal(loadSettings().agentSessionSort, "status");
  });
  withStorage([[STORAGE_KEY, JSON.stringify({ agentSessionSort: "firstSeen" })]], (values) => {
    assert.equal(loadSettings().agentSessionSort, "firstSeen");
    assert.equal(values.get(SESSION_SORT_MIGRATION_KEY), "1");
  });
});
