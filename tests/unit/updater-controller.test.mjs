import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { normalizeUpdateChannel, normalizeUpdatePreferences } from "../../src/features/updater/storage.ts";

const transpile = (path) => ts.transpileModule(
  readFileSync(new URL(path, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const source = transpile("../../src/features/updater/updaterController.ts");
const apiSource = transpile("../../src/features/updater/api.ts");

class Channel {
  onmessage = () => {};
}

async function controller({
  configured = true,
  check = async () => null,
  install = async () => {},
  proxy = null,
  version = "0.2.11",
  storedChannel = null,
  preferences = {},
} = {}) {
  const exports = {};
  const saved = [];
  let channel = storedChannel;
  let prefs = normalizeUpdatePreferences(preferences);
  const mocks = {
    "@tauri-apps/api/app": { getVersion: async () => version },
    "@tauri-apps/api/core": {
      Channel,
      isTauri: () => true,
      invoke: async (command, args) => {
        if (command === "updater_configured") return configured;
        if (command === "get_updater_proxy") return proxy;
        if (command === "updater_check") return check(args);
        if (command === "updater_install") return install((event) => args.onEvent.onmessage(event));
        throw new Error(`Unexpected command: ${command}`);
      },
    },
    "./storage": {
      loadUpdateChannel: (current) => normalizeUpdateChannel(channel, current),
      saveUpdateChannel: (next) => {
        channel = next;
        saved.push(next);
      },
      loadUpdatePreferences: () => prefs,
      saveUpdatePreferences: (patch) => (prefs = { ...prefs, ...patch }),
    },
  };
  // api.ts runs against the same core mock, so the command names stay covered.
  const api = {};
  runInNewContext(apiSource, { exports: api, require: (name) => mocks[name] });
  mocks["./api"] = api;
  runInNewContext(source, {
    exports,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
    console: { error() {} },
  });
  await new Promise(setImmediate);
  return Object.assign(exports, { saved, prefs: () => prefs, setPrefs: (patch) => (prefs = { ...prefs, ...patch }) });
}

test("update preferences default to automatic checks and drop malformed fields", () => {
  assert.deepEqual(normalizeUpdatePreferences(undefined), { autoCheck: true, skippedVersion: null, lastCheckedAt: null });
  assert.deepEqual(
    normalizeUpdatePreferences({ autoCheck: false, skippedVersion: "0.3.1", lastCheckedAt: 5 }),
    { autoCheck: false, skippedVersion: "0.3.1", lastCheckedAt: 5 },
  );
  assert.deepEqual(
    normalizeUpdatePreferences({ autoCheck: "no", skippedVersion: "", lastCheckedAt: "x" }),
    { autoCheck: true, skippedVersion: null, lastCheckedAt: null },
  );
});

test("background checks follow the auto-check switch and record the check time", async () => {
  let checks = 0;
  const app = await controller({ preferences: { autoCheck: false }, check: async () => { checks++; return null; } });
  await app.checkInBackground();
  assert.equal(checks, 0);
  app.setPrefs({ autoCheck: true });
  await app.checkInBackground();
  assert.equal(checks, 1);
  assert.equal(typeof app.prefs().lastCheckedAt, "number");
  assert.equal(app.getUpdateState().lastCheckedAt, app.prefs().lastCheckedAt);
});

test("the island reminds about a new version unless it is skipped", async () => {
  const app = await controller({ check: async () => ({ version: "0.3.1", body: null }) });
  await app.checkInBackground();
  assert.equal(app.reminderVersion(app.getUpdateState()), "0.3.1");
  app.skipVersion("0.3.1");
  assert.equal(app.prefs().skippedVersion, "0.3.1");
  assert.equal(app.reminderVersion(app.getUpdateState()), null);
  // A skipped version can still be installed by hand.
  assert.equal(app.getUpdateState().stage, "available");
  app.skipVersion(null);
  assert.equal(app.reminderVersion(app.getUpdateState()), "0.3.1");
});

test("an unsigned preview disables update checks", async () => {
  let checks = 0;
  const app = await controller({ configured: false, check: async () => { checks++; } });
  assert.equal(app.getUpdateState().stage, "disabled");
  await app.checkForUpdate();
  assert.equal(checks, 0);
});

test("update checks use the configured proxy, the stable channel and report the installed version", async () => {
  const app = await controller({
    proxy: "http://127.0.0.1:7890",
    check: async (args) => {
      assert.equal(args.proxy, "http://127.0.0.1:7890");
      assert.equal(args.channel, "stable");
      return null;
    },
  });
  await app.checkForUpdate();
  assert.equal(app.getUpdateState().stage, "latest");
  assert.equal(app.getUpdateState().version, "0.2.11");
});

test("only users who pick beta check the beta channel", async () => {
  assert.equal(normalizeUpdateChannel(null, "0.3.0"), "stable");
  assert.equal(normalizeUpdateChannel("nightly", "0.3.0"), "stable");
  assert.equal(normalizeUpdateChannel(null, "0.3.1-beta.1"), "beta");
  assert.equal(normalizeUpdateChannel("stable", "0.3.1-beta.1"), "stable");

  const channels = [];
  const app = await controller({ check: async (args) => { channels.push(args.channel); return null; } });
  await app.setUpdateChannel("beta");
  assert.deepEqual(channels, ["beta"]);
  assert.deepEqual(app.saved, ["beta"]);
  assert.equal(app.getUpdateState().channel, "beta");
  await app.setUpdateChannel("beta");
  assert.deepEqual(channels, ["beta"]);
});

test("download progress survives leaving and returning to the settings panel", async () => {
  let emit;
  let finish;
  const app = await controller({
    check: async () => ({ version: "0.2.12", body: null }),
    install: (callback) => {
      emit = callback;
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const leavePanel = app.subscribeToUpdate(() => {});
  await app.checkForUpdate();
  assert.equal(app.getUpdateState().nextVersion, "0.2.12");
  const installing = app.installUpdate();
  emit({ event: "Started", data: { contentLength: 100 } });
  emit({ event: "Progress", data: { chunkLength: 25 } });
  leavePanel();
  emit({ event: "Progress", data: { chunkLength: 35 } });
  let notifications = 0;
  const returnToPanel = app.subscribeToUpdate(() => { notifications++; });
  assert.equal(app.getUpdateState().stage, "downloading");
  assert.equal(app.getUpdateState().downloaded, 60);
  assert.equal(app.getUpdateState().total, 100);
  emit({ event: "Finished" });
  assert.equal(app.getUpdateState().stage, "installing");
  assert.equal(notifications, 1);
  finish();
  await installing;
  assert.equal(app.getUpdateState().stage, "done");
  returnToPanel();
});

test("download failures allow a new check", async () => {
  let checks = 0;
  const app = await controller({
    check: async () => {
      checks++;
      return { version: "0.2.12", body: "notes" };
    },
    install: async () => { throw "signature mismatch"; },
  });
  await app.checkForUpdate();
  assert.equal(app.getUpdateState().notes, "notes");
  await app.installUpdate();
  assert.equal(app.getUpdateState().stage, "error");
  assert.equal(app.getUpdateState().detail, "signature mismatch");
  await app.installUpdate();
  assert.equal(app.getUpdateState().stage, "error");
  await app.checkForUpdate();
  assert.equal(checks, 2);
  assert.equal(app.getUpdateState().stage, "available");
});

test("check failures can be retried without retaining stale errors", async () => {
  let checks = 0;
  const app = await controller({ check: async () => {
    if (++checks === 1) throw "manifest unavailable";
    return null;
  } });
  await app.checkForUpdate();
  assert.equal(app.getUpdateState().stage, "error");
  assert.equal(app.getUpdateState().detail, "manifest unavailable");
  await app.checkForUpdate();
  assert.equal(app.getUpdateState().stage, "latest");
  assert.equal(app.getUpdateState().detail, "");
});
