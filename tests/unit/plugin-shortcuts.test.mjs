import assert from "node:assert/strict";
import test from "node:test";
import { effectiveShortcut, pluginShortcutRows } from "../../src/features/plugins/pluginShortcuts.ts";

const plugin = (id, extra = {}) => ({
  id,
  name: { "zh-CN": id, en: id },
  enabled: true,
  dev: false,
  invalidReason: null,
  hasProcess: true,
  keybindings: {},
  commands: [
    { id: "start", title: { "zh-CN": "开始", en: "Start" }, keybinding: "Ctrl+Alt+P" },
    { id: "stop", title: { "zh-CN": "停止", en: "Stop" } },
  ],
  ...extra,
});

test("the user's shortcut wins, an empty one turns it off", () => {
  assert.equal(effectiveShortcut("Ctrl+Alt+P", undefined), "Ctrl+Alt+P");
  assert.equal(effectiveShortcut("Ctrl+Alt+P", "Alt+F9"), "Alt+F9");
  assert.equal(effectiveShortcut("Ctrl+Alt+P", ""), null);
  assert.equal(effectiveShortcut(null, "Alt+F9"), "Alt+F9");
});

test("every command of a plugin that is on gets a row", () => {
  const rows = pluginShortcutRows([plugin("a.one", { keybindings: { start: "", stop: "Alt+F9" } })]);
  assert.deepEqual(
    rows.map((row) => [row.key, row.defaultShortcut, row.shortcut, row.changed]),
    [
      ["plugin:a.one/start", "Ctrl+Alt+P", null, true],
      ["plugin:a.one/stop", null, "Alt+F9", true],
    ],
  );
});

test("plugins that are off, broken or without a process have no rows", () => {
  const rows = pluginShortcutRows([
    plugin("a.off", { enabled: false }),
    plugin("a.broken", { invalidReason: "bad manifest" }),
    plugin("a.static", { hasProcess: false }),
    plugin("a.dev", { enabled: false, dev: true }),
  ]);
  assert.deepEqual([...new Set(rows.map((row) => row.pluginId))], ["a.dev"]);
});
