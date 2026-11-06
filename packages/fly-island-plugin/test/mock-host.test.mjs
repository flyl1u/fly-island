import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PERMISSION_DENIED, METHOD_NOT_FOUND, startMockHost } from "../src/test/index.mjs";

const CLIENT = new URL("../src/client.mjs", import.meta.url);

// A plugin that exercises the SDK: each command runs one scenario.
const MAIN = `import { createPlugin } from "./client.mjs";
const plugin = createPlugin();
const report = (name, value) => plugin.log(name + " " + JSON.stringify(value));
const attempt = async (name, run) => {
  try { report(name, await run()); } catch (error) { report(name, { code: error.code, status: error.data?.status }); }
};
plugin.onReady((context) => report("ready", context));
plugin.onEvent("todos.changed", (payload) => report("todos.changed", payload));
plugin.onCommand("storage", async () => {
  await plugin.storage.set("n", { a: 1 });
  report("storage", [await plugin.storage.get("n"), await plugin.storage.keys(), await plugin.storage.delete("n"), await plugin.storage.get("n")]);
});
plugin.onCommand("todos", async () => {
  const todo = await plugin.todos.add("Write tests");
  await plugin.todos.update(todo.id, { completed: true });
  report("todos", (await plugin.todos.list()).todos);
});
plugin.onCommand("denied", () => attempt("denied", () => plugin.clipboard.history()));
plugin.onCommand("missing", () => attempt("missing", () => plugin.media.next()));
plugin.onCommand("view", async () => {
  await plugin.views.update("board", { items: [{ id: "a", title: "A" }, { id: "b", title: "B" }] });
  report("patch", await plugin.views.patch("board", [{ id: "b", title: "B2" }, { id: "c", title: "C" }]));
  report("change", await plugin.views.patch("board", { remove: ["a"], add: [{ item: { id: "z", title: "Z" }, before: "b" }, { item: { id: "y", title: "Y" } }] }));
  await attempt("twice", () => plugin.views.patch("board", { add: [{ item: { id: "z" } }] }));
  await plugin.status.update("count", "2 items");
  await attempt("long", () => plugin.status.update("count", "x".repeat(25)));
  await attempt("unknown", () => plugin.views.update("nope", {}));
});
plugin.views.onAction("board", (params) => report("action", params));
plugin.views.onMessage("page", async (message) => report("posted", await plugin.views.postMessage("page", { echo: message })));
plugin.onCommand("notify", async () => {
  for (let index = 0; index < 7; index += 1) await attempt("notify", () => plugin.notify("Hi " + index));
});
plugin.onShutdown(() => plugin.log("bye"));
`;

function makePlugin(manifest) {
  const dir = path.join(mkdtempSync(path.join(os.tmpdir(), "fly-island-mock-test-")), manifest.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "focusd-plugin.json"), JSON.stringify(manifest));
  writeFileSync(path.join(dir, "main.mjs"), MAIN);
  copyFileSync(CLIENT, path.join(dir, "client.mjs"));
  return dir;
}

const manifest = {
  id: "me.mock",
  name: { "zh-CN": "模拟", en: "Mock" },
  version: "1.0.0",
  apiVersion: 2,
  runtime: { type: "process", command: "main.mjs" },
  permissions: ["todos:read", "todos:write", "clipboard:read", "island:notify"],
  contributes: {
    views: [{ id: "board", title: { "zh-CN": "看板", en: "Board" }, template: "list" }],
    statusItems: [{ id: "count" }],
    settings: [{ key: "repo", type: "string", title: { "zh-CN": "仓库", en: "Repo" }, default: "a/b" }],
  },
};

const logged = async (host, name) => JSON.parse((await host.waitForLog(`${name} `)).slice(name.length + 1));

test("the mock host runs a plugin like the island does", async () => {
  const dir = makePlugin(manifest);
  const host = startMockHost(dir, { deny: ["clipboard:read"], settings: { extra: true }, activationEvent: "onCommand:todos" });
  try {
    const ready = await logged(host, "ready");
    assert.equal(ready.pluginId, "me.mock");
    assert.equal(ready.activationEvent, "onCommand:todos");
    assert.deepEqual(ready.capabilities, ["events", "notifications", "storage", "secrets", "views", "status", "webview"]);
    assert.deepEqual(ready.settings, { repo: "a/b", extra: true });
    await host.waitFor((state) => state.subscriptions.has("todos.changed"));

    host.command("storage");
    assert.deepEqual(await logged(host, "storage"), [{ a: 1 }, ["n"], true, null]);

    host.command("todos");
    const todos = await logged(host, "todos");
    assert.equal(todos[0].title, "Write tests");
    assert.equal(todos[0].completed, true);
    assert.deepEqual(await logged(host, "todos.changed"), { date: host.todos.date });

    host.command("denied");
    assert.deepEqual(await logged(host, "denied"), { code: PERMISSION_DENIED });
    host.command("missing");
    assert.deepEqual(await logged(host, "missing"), { code: PERMISSION_DENIED });

    host.command("view");
    assert.deepEqual(await logged(host, "patch"), { missing: ["c"] });
    assert.deepEqual(await logged(host, "change"), { missing: [] });
    assert.deepEqual(host.views.get("board").items.map((item) => item.id), ["z", "b", "y"]);
    assert.equal(host.views.get("board").items[1].title, "B2");
    assert.deepEqual(await logged(host, "twice"), { code: -32000, status: 400 });
    assert.deepEqual(await logged(host, "long"), { code: -32000, status: 400 });
    assert.equal(host.statuses.get("count").text, "2 items");
    assert.deepEqual(await logged(host, "unknown"), { code: -32000, status: 404 });
    host.viewAction("board", "check", { itemId: "a", checked: true });
    assert.deepEqual(await logged(host, "action"), { viewId: "board", actionId: "check", itemId: "a", checked: true });

    host.command("notify");
    await host.waitFor((state) => state.logs.filter((line) => line.startsWith("notify ")).length === 7);
    assert.equal(host.notifications.length, 6);
    assert.deepEqual(JSON.parse(host.logs.findLast((line) => line.startsWith("notify ")).slice(7)), { code: -32000, status: 429 });
  } finally {
    assert.equal(await host.stop(), 0);
    rmSync(path.dirname(dir), { recursive: true, force: true });
  }
  assert.ok(host.logs.includes("bye"));
});

test("a webview page and its plugin exchange messages while the page is open", async () => {
  const page = { id: "page", title: { "zh-CN": "页面", en: "Page" }, template: "webview", entry: "ui/index.html" };
  const dir = makePlugin({ ...manifest, contributes: { ...manifest.contributes, views: [...manifest.contributes.views, page] } });
  const host = startMockHost(dir);
  try {
    await logged(host, "ready");
    host.webviewMessage("page", { type: "ready" });
    assert.deepEqual(await logged(host, "posted"), { shown: false });
    host.viewVisible("page");
    host.webviewMessage("page", { type: "again" });
    await host.waitFor((state) => state.webviewMessages.length === 1);
    assert.deepEqual(host.webviewMessages, [{ viewId: "page", message: { echo: { type: "again" } } }]);
  } finally {
    await host.stop();
    rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test("API version 1 plugins get no version 2 methods", async () => {
  const dir = makePlugin({ ...manifest, apiVersion: 1, contributes: {} });
  const host = startMockHost(dir);
  try {
    const ready = await logged(host, "ready");
    assert.deepEqual(ready.capabilities, []);
    assert.equal(ready.activationEvent, undefined);
    host.command("storage");
    await host.waitFor((state) => state.requests.find((request) => request.method === "storage.set"));
    assert.equal(host.requests.find((request) => request.method === "storage.set").error.code, METHOD_NOT_FOUND);
  } finally {
    await host.stop();
    rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test("waitFor fails when the plugin exits first", async () => {
  const dir = makePlugin(manifest);
  writeFileSync(path.join(dir, "main.mjs"), "process.exit(3);\n");
  const host = startMockHost(dir);
  try {
    await assert.rejects(host.waitForLog("never"), /exited \(code 3\)/);
  } finally {
    await host.stop();
    rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});
