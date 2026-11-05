import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/features/updater/updaterController.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

async function controller({ configured = true, check = async () => null, proxy = null, search = "?window=translation" } = {}) {
  const exports = {};
  const mocks = {
    "@tauri-apps/api/app": { getVersion: async () => "0.2.11" },
    "@tauri-apps/api/core": {
      isTauri: () => true,
      invoke: async (command) => {
        if (command === "updater_configured") return configured;
        if (command === "get_updater_proxy") return proxy;
        throw new Error(`Unexpected command: ${command}`);
      },
    },
    "@tauri-apps/plugin-updater": { check },
    "./api": {
      isUpdaterConfigured: async () => configured,
      getUpdaterProxy: async () => proxy,
      listenUpdateRequests: async () => () => {},
      listenUpdateState: async () => () => {},
      publishUpdateState: async () => {},
      requestUpdateAction: async () => {},
    },
  };
  // The controller reads window.location.search to keep the translation window
  // out of the startup update flow. A bare vm context has no browser globals,
  // so they have to be supplied here or initialize() rejects at module load.
  runInNewContext(source, {
    exports,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
    console: { error() {} },
    URLSearchParams,
    window: { location: { search } },
  });
  // Let the fire-and-forget initialize()/startup download chain settle.
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  return exports;
}

function downloadedUpdate({ version = "0.2.12", download, install, close } = {}) {
  return {
    version,
    download: download ?? (async () => {}),
    install: install ?? (async () => {}),
    close: close ?? (async () => {}),
    // installUpdate() must never fall back to this once a package is ready.
    downloadAndInstall: async () => {
      throw new Error("downloadAndInstall must not run for a ready update");
    },
  };
}

test("an unsigned preview disables update checks", async () => {
  let checks = 0;
  const app = await controller({ configured: false, check: async () => { checks++; } });
  assert.equal(app.getUpdateState().stage, "disabled");
  await app.checkForUpdate();
  assert.equal(checks, 0);
});

test("update checks use the configured proxy and report the installed version", async () => {
  const app = await controller({
    proxy: "http://127.0.0.1:7890",
    check: async (options) => {
      assert.equal(options.proxy, "http://127.0.0.1:7890");
      return null;
    },
  });
  await app.checkForUpdate();
  assert.equal(app.getUpdateState().stage, "latest");
  assert.equal(app.getUpdateState().version, "0.2.11");
});

test("download progress survives leaving and returning to the settings panel", async () => {
  let emit;
  let finish;
  let closes = 0;
  const update = {
    version: "0.2.12",
    downloadAndInstall: (callback) => {
      emit = callback;
      return new Promise((resolve) => { finish = resolve; });
    },
    close: async () => { closes++; },
  };
  const app = await controller({ check: async () => update });
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
  assert.equal(closes, 0);
  emit({ event: "Finished" });
  assert.equal(app.getUpdateState().stage, "installing");
  assert.equal(notifications, 1);
  finish();
  await installing;
  assert.equal(app.getUpdateState().stage, "done");
  assert.equal(closes, 1);
  returnToPanel();
});

test("download failures release the update and allow a new check", async () => {
  let closes = 0;
  let checks = 0;
  const app = await controller({ check: async () => {
    checks++;
    return {
      version: "0.2.12",
      downloadAndInstall: async () => { throw "signature mismatch"; },
      close: async () => { closes++; },
    };
  } });
  await app.checkForUpdate();
  await app.installUpdate();
  assert.equal(app.getUpdateState().stage, "error");
  assert.equal(app.getUpdateState().detail, "signature mismatch");
  assert.equal(closes, 1);
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

test("a main window downloads a new version at startup and waits for confirmation", async () => {
  let installCalls = 0;
  const update = downloadedUpdate({
    download: async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 100 } });
    },
    install: async () => { installCalls++; },
  });
  const app = await controller({ search: "", check: async () => update });
  assert.equal(app.getUpdateState().stage, "ready");
  assert.equal(app.getUpdateState().nextVersion, "0.2.12");
  assert.equal(app.getUpdateState().downloaded, 100);
  assert.equal(app.getUpdateState().total, 100);
  assert.equal(installCalls, 0, "installing waits for the user");
  assert.equal(app.getUpdateState().dismissed, false);
});

test("installing a ready update runs the installer instead of downloading again", async () => {
  let downloadCalls = 0;
  let installCalls = 0;
  const update = downloadedUpdate({
    download: async () => { downloadCalls++; },
    install: async () => { installCalls++; },
  });
  const app = await controller({ search: "", check: async () => update });
  assert.equal(app.getUpdateState().stage, "ready");
  await app.installUpdate();
  assert.equal(installCalls, 1);
  assert.equal(downloadCalls, 1, "the startup download is not repeated");
  assert.equal(app.getUpdateState().stage, "installing");
});

test("dismissing the ready prompt keeps the package and the settings restart action", async () => {
  let installCalls = 0;
  let closes = 0;
  const update = downloadedUpdate({
    install: async () => { installCalls++; },
    close: async () => { closes++; },
  });
  const app = await controller({ search: "", check: async () => update });
  app.dismissUpdatePrompt();
  assert.equal(app.getUpdateState().dismissed, true);
  assert.equal(app.getUpdateState().stage, "ready");
  assert.equal(installCalls, 0);
  assert.equal(closes, 0, "the downloaded package is kept");
  await app.installUpdate();
  assert.equal(installCalls, 1);
});

test("the translation window skips the startup download", async () => {
  let checks = 0;
  const app = await controller({
    search: "?window=translation",
    check: async () => { checks++; return null; },
  });
  assert.equal(checks, 0);
  assert.equal(app.getUpdateState().stage, "idle");
});

test("a startup check with no new version never downloads", async () => {
  let checks = 0;
  const app = await controller({
    search: "",
    check: async () => { checks++; return null; },
  });
  assert.equal(checks, 1);
  assert.equal(app.getUpdateState().stage, "latest");
});

test("a failed startup download reports the error and can be retried", async () => {
  let checks = 0;
  const app = await controller({
    search: "",
    check: async () => {
      checks++;
      if (checks === 1) {
        return downloadedUpdate({
          download: async () => { throw "network down"; },
        });
      }
      return null;
    },
  });
  assert.equal(app.getUpdateState().stage, "error");
  assert.equal(app.getUpdateState().detail, "network down");
  await app.checkForUpdate();
  assert.equal(checks, 2);
  assert.equal(app.getUpdateState().stage, "latest");
});
