import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/features/updater/updaterController.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const flush = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };

function desktop(updateCheck) {
  const receivers = new Map();
  let ownerRequest;
  let checks = 0;
  let settingsInitializations = 0;

  function open(label) {
    const exports = {};
    const api = {
      isUpdaterConfigured: async () => { if (label === "settings") settingsInitializations++; return true; },
      getUpdaterProxy: async () => null,
      listenUpdateState: async (callback) => {
        const callbacks = receivers.get(label) ?? new Set();
        callbacks.add(callback);
        receivers.set(label, callbacks);
        return () => callbacks.delete(callback);
      },
      listenUpdateRequests: async (callback) => {
        assert.equal(label, "main", "only main may receive owner requests");
        ownerRequest = callback;
        return () => { ownerRequest = undefined; };
      },
      publishUpdateState: async (snapshot) => {
        assert.equal(label, "main", "only main may publish update state");
        for (const callbacks of receivers.values()) {
          for (const callback of callbacks) callback(structuredClone(snapshot));
        }
      },
      requestUpdateAction: async (action) => ownerRequest?.(action),
    };
    const mocks = {
      "@tauri-apps/api/app": { getVersion: async () => "0.2.16" },
      "@tauri-apps/api/core": { isTauri: () => true },
      "@tauri-apps/plugin-updater": {
        check: async () => {
          assert.equal(label, "main", "settings must never create an update handle");
          checks++;
          return updateCheck();
        },
      },
      "./api": api,
    };
    runInNewContext(source, {
      exports,
      require: (name) => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; },
      URLSearchParams,
      window: { location: { search: label === "main" ? "" : `?window=${label}` } },
      console: { error() {} },
    });
    return exports;
  }

  return {
    open,
    close: (label) => receivers.delete(label),
    get checks() { return checks; },
    get settingsInitializations() { return settingsInitializations; },
  };
}

test("closing and rebuilding settings retains the main window's download and installer", async () => {
  let progress;
  let finishDownload;
  let downloads = 0;
  let installs = 0;
  let finishInstall;
  const app = desktop(async () => ({
    version: "0.2.17",
    download: (callback) => {
      downloads++;
      progress = callback;
      return new Promise((resolve) => { finishDownload = resolve; });
    },
    install: () => {
      installs++;
      return new Promise((resolve) => { finishInstall = resolve; });
    },
    close: async () => { throw new Error("download handle must remain alive"); },
  }));
  const main = app.open("main");
  await flush();
  progress({ event: "Started", data: { contentLength: 100 } });
  progress({ event: "Progress", data: { chunkLength: 40 } });
  const settings = app.open("settings");
  await flush();
  assert.equal(settings.getUpdateState().downloaded, 40);
  assert.equal(settings.getUpdateState().stage, "downloading");
  await settings.checkForUpdate();
  await settings.installUpdate();
  assert.equal(app.checks, 1);
  assert.equal(downloads, 1);
  assert.equal(installs, 0);

  app.close("settings");
  progress({ event: "Progress", data: { chunkLength: 20 } });
  const reopened = app.open("settings");
  await flush();
  assert.equal(reopened.getUpdateState().downloaded, 60);
  finishDownload();
  await flush();
  assert.equal(reopened.getUpdateState().stage, "ready");
  assert.equal(main.getUpdateState().stage, "ready");
  reopened.dismissUpdatePrompt();
  assert.equal(main.getUpdateState().dismissed, true);
  assert.equal(reopened.getUpdateState().dismissed, true);
  await Promise.all([reopened.installUpdate(), reopened.installUpdate()]);
  assert.equal(installs, 1, "double clicking still runs one installer");
  assert.equal(reopened.getUpdateState().stage, "installing");
  finishInstall();
  await flush();
  assert.equal(app.settingsInitializations, 0);
});

test("settings opened before the owner initializes receives its later snapshot", async () => {
  const app = desktop(async () => null);
  const settings = app.open("settings");
  await flush();
  const main = app.open("main");
  await flush();
  assert.equal(main.getUpdateState().stage, "latest");
  assert.equal(settings.getUpdateState().stage, "latest");
  assert.equal(settings.getUpdateState().version, "0.2.16");
  assert.equal(app.checks, 1);
  assert.equal(app.settingsInitializations, 0);
});

test("concurrent manual requests from settings are serialized by the main window", async () => {
  let finishCheck;
  let call = 0;
  const app = desktop(() => {
    if (call++ === 0) return null;
    return new Promise((resolve) => { finishCheck = resolve; });
  });
  app.open("main");
  await flush();
  const settings = app.open("settings");
  await flush();
  await Promise.all([settings.checkForUpdate(), settings.checkForUpdate()]);
  assert.equal(app.checks, 2, "one startup check and one manual check");
  assert.equal(settings.getUpdateState().stage, "checking");
  finishCheck(null);
  await flush();
  assert.equal(settings.getUpdateState().stage, "latest");
});
