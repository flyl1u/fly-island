import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { normalizeUpdateChannel } from "../../src/features/updater/storage.ts";

const transpile = (path) => ts.transpileModule(
  readFileSync(new URL(path, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const source = transpile("../../src/features/updater/updaterController.ts");
const apiSource = transpile("../../src/features/updater/api.ts");

class Channel {
  onmessage = () => {};
}

const settle = () => new Promise(setImmediate);

async function controller({
  configured = true,
  check = async () => null,
  download = async () => {},
  install = async () => {},
  version = "0.2.11",
  storedChannel = null,
  windowKind = null,
} = {}) {
  const exports = {};
  const calls = [];
  const emitted = [];
  let channel = storedChannel;
  const mocks = {
    "@tauri-apps/api/app": { getVersion: async () => version },
    "@tauri-apps/api/core": {
      Channel,
      isTauri: () => true,
      invoke: async (command, args) => {
        calls.push(command);
        const send = (event) => args.onEvent.onmessage(event);
        if (command === "updater_configured") return configured;
        if (command === "get_updater_proxy") return null;
        if (command === "updater_check") return check(args);
        if (command === "updater_download") return download(send);
        if (command === "updater_install") return install(send);
        throw new Error(`Unexpected command: ${command}`);
      },
    },
    "@tauri-apps/api/event": {
      listen: async () => () => {},
      emit: async (name, payload) => emitted.push({ name, payload }),
      emitTo: async (target, name, payload) => emitted.push({ target, name, payload }),
    },
    "./storage": {
      loadUpdateChannel: (current) => normalizeUpdateChannel(channel, current),
      saveUpdateChannel: (next) => {
        channel = next;
      },
    },
  };
  const api = {};
  runInNewContext(apiSource, { exports: api, require: (name) => mocks[name] });
  mocks["./api"] = api;
  runInNewContext(source, {
    exports,
    window: { location: { search: windowKind ? `?window=${windowKind}` : "" } },
    URLSearchParams,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
    console: { error() {} },
  });
  for (let i = 0; i < 5; i++) await settle();
  return Object.assign(exports, { calls, emitted });
}

test("a pre-release build defaults to the beta channel, others to stable", () => {
  assert.equal(normalizeUpdateChannel(null, "0.3.1-beta.1"), "beta");
  assert.equal(normalizeUpdateChannel(null, "0.3.1"), "stable");
  assert.equal(normalizeUpdateChannel("beta", "0.3.1"), "beta");
  assert.equal(normalizeUpdateChannel("nightly", "0.3.1"), "stable");
});

test("startup checks the stored channel and downloads without installing", async () => {
  const seen = [];
  const updater = await controller({
    storedChannel: "beta",
    check: async (args) => {
      seen.push(args.channel);
      return { version: "0.3.0-beta.2", body: null };
    },
    download: async (send) => {
      send({ event: "Started", data: { contentLength: 10 } });
      send({ event: "Progress", data: { chunkLength: 10 } });
      send({ event: "Finished" });
    },
  });
  assert.deepEqual(seen, ["beta"]);
  const state = updater.getUpdateState();
  assert.equal(state.stage, "ready");
  assert.equal(state.nextVersion, "0.3.0-beta.2");
  assert.equal(state.downloaded, 10);
  assert.ok(!updater.calls.includes("updater_install"), "nothing installs until the user agrees");
});

test("installing a downloaded update goes straight to the installer", async () => {
  const updater = await controller({
    check: async () => ({ version: "0.3.0", body: null }),
    install: async (send) => send({ event: "Finished" }),
  });
  assert.equal(updater.getUpdateState().stage, "ready");
  await updater.installUpdate();
  assert.equal(updater.getUpdateState().stage, "done");
});

test("hiding the update todo keeps the download", async () => {
  const updater = await controller({ check: async () => ({ version: "0.3.0", body: null }) });
  updater.dismissUpdatePrompt();
  const state = updater.getUpdateState();
  assert.equal(state.dismissed, true);
  assert.equal(state.stage, "ready");
});

test("no update leaves the island on latest; an unconfigured build never checks", async () => {
  const latest = await controller();
  assert.equal(latest.getUpdateState().stage, "latest");

  const disabled = await controller({ configured: false });
  assert.equal(disabled.getUpdateState().stage, "disabled");
  assert.ok(!disabled.calls.includes("updater_check"));
});

test("switching channel saves it and checks again", async () => {
  const seen = [];
  const updater = await controller({
    check: async (args) => {
      seen.push(args.channel);
      return null;
    },
  });
  await updater.setUpdateChannel("beta");
  assert.deepEqual(seen, ["stable", "beta"]);
  assert.equal(updater.getUpdateState().channel, "beta");
});

test("the settings window forwards actions to the main window instead of checking", async () => {
  const updater = await controller({ windowKind: "settings" });
  await updater.checkForUpdate();
  assert.ok(!updater.calls.includes("updater_check"));
  assert.deepEqual(
    JSON.stringify(updater.emitted.filter((event) => event.target === "main").map((event) => event.payload)),
    JSON.stringify([{ action: "snapshot" }, { action: "check" }]),
  );
});
