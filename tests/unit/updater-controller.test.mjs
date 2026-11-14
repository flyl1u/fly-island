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
const scheduleSource = transpile("../../src/features/updater/autoUpdateSchedule.ts");
const schedule = {};
runInNewContext(scheduleSource, { exports: schedule });

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
  autoUpdate = true,
  proxies = [],
} = {}) {
  const exports = {};
  const calls = [];
  const emitted = [];
  const saved = [];
  const proxiesSeen = [];
  const requestListeners = [];
  // Timers never fire on their own; a test runs the pending one with `fireTimer`.
  const timers = new Map();
  let nextTimer = 1;
  const mocks = {
    "@tauri-apps/api/app": { getVersion: async () => version },
    "@tauri-apps/api/core": {
      Channel,
      isTauri: () => true,
      invoke: async (command, args) => {
        calls.push(command);
        const send = (event) => args.onEvent.onmessage(event);
        if (command === "updater_configured") return configured;
        if (command === "get_updater_proxy") return proxies.shift() ?? null;
        if (command === "updater_check") {
          proxiesSeen.push(args.proxy);
          return check(args);
        }
        if (command === "updater_download") return download(send);
        if (command === "updater_install") return install(send);
        throw new Error(`Unexpected command: ${command}`);
      },
    },
    "@tauri-apps/api/event": {
      listen: async (name, callback) => {
        if (name === "focusd-update-request") requestListeners.push(callback);
        return () => {};
      },
      emit: async (name, payload) => emitted.push({ name, payload }),
      emitTo: async (target, name, payload) => emitted.push({ target, name, payload }),
    },
  };
  const api = {};
  runInNewContext(apiSource, { exports: api, require: (name) => mocks[name] });
  mocks["./api"] = api;
  mocks["./autoUpdateSchedule.ts"] = schedule;
  mocks["./storage.ts"] = {
    loadAutoUpdate: () => autoUpdate,
    saveAutoUpdate: (enabled) => saved.push(enabled),
  };
  runInNewContext(source, {
    exports,
    window: { location: { search: windowKind ? `?window=${windowKind}` : "" } },
    URLSearchParams,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
    console: { error() {} },
    setTimeout: (callback, delay) => {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  for (let i = 0; i < 5; i++) await settle();
  const pendingDelays = () => [...timers.values()].map((timer) => timer.delay);
  const fireTimer = async () => {
    const [[id, timer]] = timers;
    timers.delete(id);
    timer.callback();
    for (let i = 0; i < 5; i++) await settle();
  };
  const request = async (payload) => {
    for (const listener of requestListeners) listener({ payload });
    for (let i = 0; i < 5; i++) await settle();
  };
  // The startup check is a zero-delay timer, as a real one would be.
  if (pendingDelays()[0] === 0) await fireTimer();
  return Object.assign(exports, { calls, emitted, saved, proxiesSeen, pendingDelays, fireTimer, request });
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

test("automatic updates check again every six hours", async () => {
  const updater = await controller();
  assert.equal(updater.getUpdateState().stage, "latest");
  assert.deepEqual(updater.pendingDelays(), [schedule.CHECK_INTERVAL_MS]);
  await updater.fireTimer();
  assert.equal(updater.calls.filter((command) => command === "updater_check").length, 2);
  assert.deepEqual(updater.pendingDelays(), [schedule.CHECK_INTERVAL_MS]);
});

test("a failed check retries sooner and asks for the proxy again", async () => {
  let attempts = 0;
  const updater = await controller({
    proxies: [null, "http://127.0.0.1:7890"],
    check: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("error sending request");
      return { version: "0.3.0", body: null };
    },
  });
  assert.equal(updater.getUpdateState().stage, "error");
  assert.deepEqual(updater.pendingDelays(), [schedule.RETRY_DELAYS_MS[0]]);
  await updater.fireTimer();
  assert.deepEqual(updater.proxiesSeen, [null, "http://127.0.0.1:7890"]);
  assert.equal(updater.getUpdateState().stage, "ready");
  assert.deepEqual(updater.pendingDelays(), [schedule.CHECK_INTERVAL_MS]);
});

test("retry delays back off and then fall back to the regular interval", () => {
  assert.equal(schedule.nextCheckDelay(0), schedule.CHECK_INTERVAL_MS);
  assert.deepEqual([1, 2, 3].map(schedule.nextCheckDelay), [60_000, 300_000, 1_800_000]);
  assert.equal(schedule.nextCheckDelay(4), schedule.CHECK_INTERVAL_MS);
});

test("with automatic updates off nothing checks until asked or turned back on", async () => {
  const updater = await controller({ autoUpdate: false });
  assert.equal(updater.getUpdateState().autoUpdate, false);
  assert.ok(!updater.calls.includes("updater_check"));
  assert.deepEqual(updater.pendingDelays(), []);

  await updater.checkForUpdate();
  assert.equal(updater.calls.filter((command) => command === "updater_check").length, 1);
  assert.deepEqual(updater.pendingDelays(), [], "a manual check schedules nothing");

  updater.setAutoUpdate(true);
  assert.deepEqual(updater.saved, [true]);
  assert.deepEqual(updater.pendingDelays(), [0]);
  updater.setAutoUpdate(false);
  assert.deepEqual(updater.pendingDelays(), []);
});

test("the settings window saves the switch and the main window applies it", async () => {
  const settings = await controller({ windowKind: "settings" });
  settings.setAutoUpdate(false);
  assert.deepEqual(settings.saved, [false]);
  assert.equal(settings.getUpdateState().autoUpdate, false);
  assert.ok(settings.emitted.some((event) => event.target === "main" && event.payload.action === "auto" && event.payload.enabled === false));

  const main = await controller();
  await main.request({ action: "auto", enabled: false });
  assert.equal(main.getUpdateState().autoUpdate, false);
  assert.deepEqual(main.pendingDelays(), []);
});
