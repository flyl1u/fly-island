import assert from "node:assert/strict";
import { test } from "node:test";
import { filterStorage, isTransferableKey, parseBackup, validateBackup } from "../../src/features/config-transfer/format.ts";
import { applyConfigStorage, collectConfigStorage } from "../../src/features/config-transfer/storage.ts";
import { legacyBackupAppValue, legacyStorageKey } from "../../src/shared/storage/legacyMigration.ts";

const backup = () => ({ app: "fly-island", formatVersion: 1, exportedAt: "2026-11-19T00:00:00Z", appVersion: "3.2.8", localStorage: {}, files: {} });

test("prefix discovery includes future features and language, excludes foreign/device/runtime keys", () => {
  const entries = Object.fromEntries(["fly-island-future", "fly-island-locale", "fly-island-position",
    "fly-island-panel-preview", "fly-island-settings-focus", "fly-island-position-reset", "other", "fly-island"].map(key => [key, "raw"]));
  assert.deepEqual(filterStorage(entries, false), { "fly-island-future": "raw", "fly-island-locale": "raw" });
  assert.equal(isTransferableKey("fly-island-clipboard-window-pinned", false), true);
  assert.equal(isTransferableKey("fly-island-clipboard-history", false), false);
  assert.equal(isTransferableKey("fly-island-clipboard-history", true), true);
  assert.equal(isTransferableKey("fly-island-first-launch-defaults-v1"), false);
});

test("format errors distinguish legacy theme files, other apps, versions and corrupt structures", () => {
  assert.deepEqual(parseBackup(JSON.stringify(backup())), backup());
  for (const [value, code] of [[{ ...backup(), app: "other" }, "wrongApp"],
    [{ ...backup(), formatVersion: 2 }, "unsupportedVersion"], [{ app: "fly-island", version: 1, kind: "theme" }, "unsupportedVersion"],
    [{ ...backup(), localStorage: [] }, "invalidStructure"], [{ ...backup(), localStorage: { key: {} } }, "invalidStructure"],
    [{ ...backup(), files: null }, "invalidStructure"], [{ ...backup(), exportedAt: "bad" }, "invalidStructure"], [null, "invalidStructure"]]) {
    assert.throws(() => validateBackup(value), error => error.code === code);
  }
  assert.throws(() => parseBackup("{bad"), error => error.code === "invalidJson");
});

test("legacy backups are accepted and exported keys are normalized", () => {
  const legacy = { ...backup(), app: legacyBackupAppValue(), localStorage: { [legacyStorageKey("settings")]: "old" } };
  const parsed = parseBackup(JSON.stringify(legacy));
  assert.equal(parsed.app, "fly-island");
  assert.deepEqual(filterStorage(parsed.localStorage, true), { "fly-island-settings": "old" });
});

function mockStorage(initial, failOnce) {
  const data = new Map(Object.entries(initial));
  const localStorage = {
    get length() { return data.size; }, key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null, removeItem: key => data.delete(key),
    setItem(key, value) {
      if (failOnce === key) { failOnce = undefined; throw new Error("QuotaExceededError"); }
      data.set(key, value);
    },
  };
  globalThis.window = { localStorage };
  return data;
}

test("restore replaces raw values, clears missing app keys and preserves this device", () => {
  const data = mockStorage({ "fly-island-old": "old", "fly-island-position": "here", foreign: "keep" });
  applyConfigStorage({ "fly-island-new": "{raw}", "fly-island-position": "there", foreign: "bad" });
  assert.deepEqual(Object.fromEntries(data), { "fly-island-position": "here", foreign: "keep", "fly-island-new": "{raw}" });
  assert.deepEqual(collectConfigStorage(false), { "fly-island-new": "{raw}" });
});

test("failed writes roll the app keys back", () => {
  const initial = { "fly-island-old": "original", "fly-island-position": "here" };
  const data = mockStorage(initial, "fly-island-new");
  assert.throws(() => applyConfigStorage({ "fly-island-new": "next" }), /storageUnavailable/);
  assert.deepEqual(Object.fromEntries(data), initial);
});
