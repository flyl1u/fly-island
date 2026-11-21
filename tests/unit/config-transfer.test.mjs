import assert from "node:assert/strict";
import { test } from "node:test";
import { filterStorage, isTransferableKey, parseBackup, validateBackup } from "../../src/features/config-transfer/format.ts";
import { applyConfigStorage, collectConfigStorage } from "../../src/features/config-transfer/storage.ts";

const backup = () => ({ app: "fly-island", formatVersion: 1, exportedAt: "2026-11-19T00:00:00Z", appVersion: "3.2.8", localStorage: {}, files: {} });

test("prefix discovery includes future features and language, excludes foreign/device/runtime keys", () => {
  const entries = Object.fromEntries(["focusd-island-future", "focusd-island-locale", "focusd-island-position",
    "focusd-island-panel-preview", "focusd-island-settings-focus", "focusd-island-position-reset", "other", "focusd-island"].map(key => [key, "raw"]));
  assert.deepEqual(filterStorage(entries, false), { "focusd-island-future": "raw", "focusd-island-locale": "raw" });
  assert.equal(isTransferableKey("focusd-island-clipboard-window-pinned", false), true);
  assert.equal(isTransferableKey("focusd-island-clipboard-history", false), false);
  assert.equal(isTransferableKey("focusd-island-clipboard-history", true), true);
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
  const data = mockStorage({ "focusd-island-old": "old", "focusd-island-position": "here", foreign: "keep" });
  applyConfigStorage({ "focusd-island-new": "{raw}", "focusd-island-position": "there", foreign: "bad" });
  assert.deepEqual(Object.fromEntries(data), { "focusd-island-position": "here", foreign: "keep", "focusd-island-new": "{raw}" });
  assert.deepEqual(collectConfigStorage(false), { "focusd-island-new": "{raw}" });
});

test("failed writes roll the app keys back", () => {
  const initial = { "focusd-island-old": "original", "focusd-island-position": "here" };
  const data = mockStorage(initial, "focusd-island-new");
  assert.throws(() => applyConfigStorage({ "focusd-island-new": "next" }), /storageUnavailable/);
  assert.deepEqual(Object.fromEntries(data), initial);
});
