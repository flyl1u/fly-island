import assert from "node:assert/strict";
import test from "node:test";
import { builtinPluginState } from "../../src/features/plugins/builtinPlugin.ts";

const plugin = (extra) => ({ id: "focusd.usage-ring", builtin: true, enabled: true, status: "running", settings: { window: "5h" }, ...extra });
const snapshot = (...plugins) => ({ allowThirdParty: false, nodeAvailable: false, pluginsDir: "", plugins, autoUpdate: false, trustedPublishers: [] });

test("a built-in plugin is on only while it is enabled and running", () => {
  assert.deepEqual(builtinPluginState(snapshot(plugin()), "focusd.usage-ring"), { enabled: true, settings: { window: "5h" } });
  for (const extra of [{ enabled: false }, { status: "stopped" }, { status: "crashed" }]) {
    assert.equal(builtinPluginState(snapshot(plugin(extra)), "focusd.usage-ring").enabled, false, JSON.stringify(extra));
  }
});

test("settings are passed on even while the plugin is off", () => {
  assert.deepEqual(builtinPluginState(snapshot(plugin({ enabled: false })), "focusd.usage-ring").settings, { window: "5h" });
});

test("a missing plugin, no snapshot yet, or a plugin from disk with the same id is off", () => {
  assert.deepEqual(builtinPluginState(null, "focusd.usage-ring"), { enabled: false, settings: {} });
  assert.equal(builtinPluginState(snapshot(), "focusd.usage-ring").enabled, false);
  assert.equal(builtinPluginState(snapshot(plugin({ builtin: false })), "focusd.usage-ring").enabled, false);
  assert.equal(builtinPluginState(snapshot(plugin()), "focusd.other").enabled, false);
});
