import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/features/appearance/settings.ts";
import { FIRST_LAUNCH_SETTINGS } from "../../src/features/appearance/index.ts";
import { loadSettings } from "../../src/features/appearance/storage.ts";
import * as defaults from "../../src/features/onboarding/defaults.ts";
import * as storage from "../../src/features/onboarding/storage.ts";
import { migrateLegacyStorage, legacyStorageKey } from "../../src/shared/storage/legacyMigration.ts";
import { applyConfigStorage } from "../../src/features/config-transfer/storage.ts";

function memoryStorage(initial = {}, failKey) {
  const data = new Map(Object.entries(initial));
  globalThis.window = { localStorage: {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem(key, value) {
      if (key === failKey) throw new Error("QuotaExceededError");
      data.set(key, String(value));
    },
    removeItem: key => data.delete(key),
  } };
  return data;
}

test("a fresh profile receives the captured preferences and survives the settings loader", () => {
  const data = memoryStorage({ foreign: "keep" });
  assert.equal(storage.seedFirstLaunchDefaults(), true);
  assert.deepEqual(loadSettings(), FIRST_LAUNCH_SETTINGS);
  assert.deepEqual(normalizeSettings(FIRST_LAUNCH_SETTINGS), FIRST_LAUNCH_SETTINGS);
  assert.equal(data.get("fly-island-wechat-message-preview-enabled"), "false");
  assert.equal(JSON.parse(data.get("fly-island-translation-settings")).shortcut, "Alt+V");
  assert.equal(data.get("fly-island-todo-remind-minutes"), "1");
  assert.equal(data.get("foreign"), "keep");
  for (const key of ["todos", "qq-mail-settings", "save-directory", "position", "weather-cache"]) {
    assert.equal(data.has(`fly-island-${key}`), false, key);
  }
});

test("all existing profiles stay byte-for-byte unchanged, even with no settings or invalid JSON", () => {
  for (const initial of [
    { "fly-island-settings": JSON.stringify({ todoTimerEnabled: false, collapsedScale: 1 }) },
    { "fly-island-settings": "{broken" },
    { "fly-island-todos": "[]" },
    { "fly-island-locale": "en" },
    { "fly-island-wechat-message-preview-enabled": "true" },
    { "fly-island-first-launch-defaults-v1": "unknown-version" },
  ]) {
    const data = memoryStorage(initial);
    assert.equal(storage.seedFirstLaunchDefaults(), false);
    assert.deepEqual(Object.fromEntries(data), initial);
  }
  // Missing fields keep their pre-change behaviour; changing the fresh profile must not change these.
  const old = normalizeSettings({});
  for (const key of ["todoTimerEnabled", "todoTimerReminder", "keepVisibleWhileLyrics", "ctrlWheelPages"]) {
    assert.equal(old[key], false, key);
  }
  assert.equal(old.collapsedScale, DEFAULT_SETTINGS.collapsedScale);
  assert.equal(old.tuckDelaySeconds, 30);
  assert.equal(old.clipboardVisibleRows, 4);
});

test("legacy migration and imported preferences run before first-launch detection", () => {
  const legacy = memoryStorage({ [legacyStorageKey("settings")]: "{}" });
  migrateLegacyStorage();
  assert.equal(storage.seedFirstLaunchDefaults(), false);
  assert.equal(legacy.get("fly-island-settings"), "{}");
  const failedMigration = memoryStorage({ [legacyStorageKey("settings")]: "{}" }, "fly-island-settings");
  migrateLegacyStorage();
  assert.equal(storage.seedFirstLaunchDefaults(), false);
  assert.equal(failedMigration.get(legacyStorageKey("settings")), "{}");
  assert.equal(failedMigration.size, 1);
  const imported = memoryStorage();
  applyConfigStorage({ "fly-island-settings": '{"todoTimerEnabled":false}' });
  const before = [...imported];
  assert.equal(storage.seedFirstLaunchDefaults(), false);
  assert.deepEqual([...imported], before);
});

test("failed writes roll back and unavailable storage cannot classify an existing user as new", () => {
  const data = memoryStorage({ foreign: "keep" }, "fly-island-tray-visible");
  assert.equal(storage.seedFirstLaunchDefaults(), false);
  assert.deepEqual(Object.fromEntries(data), { foreign: "keep" });
  globalThis.window = { get localStorage() { throw new Error("blocked"); } };
  assert.doesNotThrow(() => assert.equal(storage.seedFirstLaunchDefaults(), false));
});

const startupSource = ts.transpileModule(
  readFileSync(new URL("../../src/windows/island/initializeDefaults.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function startup({ tauri = true, failNative = false } = {}) {
  const calls = [], firstLaunch = [], errors = [], exports = {};
  let tail = Promise.resolve();
  const mocks = {
    "@tauri-apps/api/core": { isTauri: () => tauri },
    "../../features/clipboard/api.ts": { setClipboardHistorySettings: async value => {
      calls.push(["clipboard", value]);
      if (failNative) throw new Error("clipboard unavailable");
    } },
    "../../features/diagnostics/api.ts": { setAppLogEnabled: async value => calls.push(["log", value]) },
    "../../features/onboarding/firstLaunch.ts": { captureFirstLaunch: value => firstLaunch.push(value) },
    "../../features/onboarding/defaults.ts": defaults,
    "../../features/onboarding/storage.ts": storage,
  };
  runInNewContext(startupSource, {
    exports, require: name => {
      assert.ok(mocks[name], `missing mock: ${name}`);
      return mocks[name];
    },
    navigator: { locks: { request: (_name, run) => {
      const result = tail.then(run);
      tail = result.catch(() => {});
      return result;
    } } },
    console: { error: (...args) => errors.push(args) },
  });
  return { initialize: exports.initializeFirstLaunchDefaults, calls, firstLaunch, errors };
}

test("translation may start first; main applies native defaults once and preserves later choices", async () => {
  const data = memoryStorage();
  const app = startup();
  await Promise.all([app.initialize(false), app.initialize(true)]);
  assert.deepEqual(app.firstLaunch, [true, true]);
  assert.deepEqual(app.calls, [["clipboard", defaults.FIRST_LAUNCH_CLIPBOARD], ["log", true]]);
  assert.equal(data.get(storage.FIRST_LAUNCH_DEFAULTS_KEY), "complete");
  data.set("fly-island-settings", '{"todoTimerEnabled":false}');
  data.set("fly-island-wechat-message-preview-enabled", "true");
  const before = [...data];
  await app.initialize(true);
  assert.equal(app.calls.length, 2);
  assert.equal(app.firstLaunch.at(-1), false);
  assert.deepEqual([...data], before);
});

test("old users trigger no native setters; one failed setter does not prevent the other", async () => {
  memoryStorage({ "fly-island-settings": "{}" });
  const old = startup();
  await old.initialize(true);
  assert.deepEqual(old.calls, []);
  memoryStorage();
  const fresh = startup({ failNative: true });
  await fresh.initialize(true);
  assert.equal(fresh.calls.length, 2);
  assert.equal(fresh.errors.length, 1);
  await fresh.initialize(true);
  assert.equal(fresh.calls.length, 2);
});

test("browser previews seed preferences without calling native APIs", async () => {
  memoryStorage();
  const app = startup({ tauri: false });
  await app.initialize(true);
  assert.deepEqual(app.calls, []);
  assert.deepEqual(loadSettings(), FIRST_LAUNCH_SETTINGS);
});
