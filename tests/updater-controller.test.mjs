import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/updaterController.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

async function controller({ configured = true, check = async () => null, proxy = null } = {}) {
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
  };
  runInNewContext(source, {
    exports,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
    console: { error() {} },
  });
  await new Promise(setImmediate);
  return exports;
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
