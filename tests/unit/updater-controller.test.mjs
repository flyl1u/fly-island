import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const transpile = (path) => ts.transpileModule(
  readFileSync(new URL(path, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const source = transpile("../../src/features/updater/updaterController.ts");
const apiSource = transpile("../../src/features/updater/api.ts");
const scheduleSource = transpile("../../src/features/updater/updateSchedule.ts");

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
  windowKind = null,
} = {}) {
  const exports = {};
  const calls = [];
  const timers = [];
  const emitted = [];
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
  };
  const api = {};
  runInNewContext(apiSource, { exports: api, require: (name) => mocks[name] });
  mocks["./api"] = api;
  const schedule = {};
  runInNewContext(scheduleSource, { exports: schedule, require: (name) => mocks[name] });
  mocks["./updateSchedule"] = schedule;
  runInNewContext(source, {
    exports,
    window: { location: { search: windowKind ? `?window=${windowKind}` : "" } },
    URLSearchParams,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
    console: { error() {} },
    setTimeout: (run, ms) => timers.push({ run, ms }),
    clearTimeout: () => {},
  });
  for (let i = 0; i < 5; i++) await settle();
  return Object.assign(exports, { calls, emitted, timers });
}

test("startup checks the stable channel and downloads without installing", async () => {
  const seen = [];
  const updater = await controller({
    // A pre-release build (someone who picked beta before the choice was removed) checks stable too.
    version: "0.3.0-beta.1",
    check: async (args) => {
      seen.push(args.channel);
      return { version: "0.3.0", body: null };
    },
    download: async (send) => {
      send({ event: "Started", data: { contentLength: 10 } });
      send({ event: "Progress", data: { chunkLength: 10 } });
      send({ event: "Finished" });
    },
  });
  assert.deepEqual(seen, ["stable"]);
  const state = updater.getUpdateState();
  assert.equal(state.stage, "ready");
  assert.equal(state.nextVersion, "0.3.0");
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

test("the settings window forwards actions to the main window instead of checking", async () => {
  const updater = await controller({ windowKind: "settings" });
  await updater.checkForUpdate();
  assert.ok(!updater.calls.includes("updater_check"));
  assert.deepEqual(
    JSON.stringify(updater.emitted.filter((event) => event.target === "main").map((event) => event.payload)),
    JSON.stringify([{ action: "snapshot" }, { action: "check" }]),
  );
});

test("a failed startup check retries, so the update todo still appears", async () => {
  let online = false;
  const updater = await controller({
    check: async () => {
      if (!online) throw new Error("error sending request");
      return { version: "0.3.0", body: null };
    },
  });
  assert.equal(updater.getUpdateState().stage, "error");
  assert.equal(updater.timers.at(-1).ms, 2 * 60 * 1000, "retries within minutes");
  online = true;
  updater.timers.at(-1).run();
  for (let i = 0; i < 5; i++) await settle();
  assert.equal(updater.getUpdateState().stage, "ready");
});

test("an island already on the latest version checks again later", async () => {
  const updater = await controller();
  assert.equal(updater.getUpdateState().stage, "latest");
  assert.equal(updater.timers.at(-1).ms, 6 * 60 * 60 * 1000);
});

test("a failed background download keeps offering the update", async () => {
  const updater = await controller({
    check: async () => ({ version: "0.3.0", body: null }),
    download: async () => { throw new Error("github unreachable"); },
  });
  const state = updater.getUpdateState();
  assert.equal(state.stage, "available", "the todo stays; its button downloads again");
  assert.match(state.detail, /github unreachable/);
});
