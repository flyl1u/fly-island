import assert from "node:assert/strict";
import { test } from "node:test";
import { NATIVE_PLUGINS, NATIVE_PLUGIN_IDS, PACKAGED_MARKET_PLUGINS } from "../../src/features/plugins/native/catalog.ts";
import { externalPlacement, fallbackPlacement, isPluginPage, placedPlugins, pluginsOnPage, standalonePages } from "../../src/features/plugins/placement.ts";

const none = Object.fromEntries(NATIVE_PLUGIN_IDS.map((id) => [id, false]));
const plugin = (id, contributes = ["panel"], enabled = true) => ({ enabled, manifest: { id, contributes } });
const page = (list, id) => list.find((item) => item.id === id);

test("every catalog plugin declares where its settings go, or that it has none", () => {
  for (const entry of [...NATIVE_PLUGINS, ...PACKAGED_MARKET_PLUGINS]) {
    assert.ok("settings" in entry, entry.id);
    if (entry.settings) assert.match(entry.settings.placement, /^(standalone|agentSessions|agentConnect|messages)$/, entry.id);
  }
});

test("built-in plugins go by their kind of feature", () => {
  const placed = placedPlugins(Object.fromEntries(NATIVE_PLUGIN_IDS.map((id) => [id, true])), {});
  for (const id of ["dingtalk", "feishu", "wecom"]) assert.equal(page(placed, id).category, "messages", id);
  for (const id of ["cursor", "kimiCode", "codebuddy", "antigravity", "zcode", "hermes"]) assert.equal(page(placed, id).category, "agents", id);
  assert.equal(page(placed, "clockWeather").category, "clockWeather");
  assert.equal(page(placed, "calendarMarks"), undefined);
  assert.deepEqual(standalonePages(placed).map((item) => item.id), ["clockWeather"]);
});

test("packaged plugins get their own page or an Agent group", () => {
  const installed = Object.fromEntries(["minimax", "device-battery", "eye-care"].map((id) => [id, plugin(id)]));
  const placed = placedPlugins(none, installed);
  assert.deepEqual(standalonePages(placed).map((item) => item.category), ["devices", "plugin:eye-care"]);
  assert.equal(page(placed, "minimax").category, "agents");
  assert.equal(page(placed, "minimax").actionsCategory, "agentConnect");
  assert.deepEqual(pluginsOnPage(placed, "agentConnect").map((item) => item.id), ["minimax"]);
  assert.deepEqual(pluginsOnPage(placed, "agents").map((item) => item.id), ["minimax"]);
});

test("a plugin that is off or absent has no page", () => {
  assert.deepEqual(placedPlugins(none, { "eye-care": plugin("eye-care", ["panel"], false) }), []);
  assert.deepEqual(placedPlugins(none, {}), []);
});

test("a plugin outside the catalog goes by what it contributes", () => {
  assert.equal(fallbackPlacement({ contributes: ["quota", "notifications"] }).placement, "agentSessions");
  assert.equal(fallbackPlacement({ contributes: ["sessions"] }).placement, "agentSessions");
  assert.equal(fallbackPlacement({ contributes: ["notifications"] }).placement, "messages");
  assert.equal(fallbackPlacement({ contributes: ["panel"] }).placement, "standalone");
  assert.equal(externalPlacement("eye-care", { contributes: ["quota"] }).placement, "standalone");
  const placed = placedPlugins(none, { "zeta-tool": plugin("zeta-tool"), "alpha-tool": plugin("alpha-tool") });
  assert.deepEqual(placed.map((item) => item.category), ["plugin:alpha-tool", "plugin:zeta-tool"]);
});

test("pages that exist only for a plugin are told apart from the fixed ones", () => {
  for (const name of ["clockWeather", "devices", "plugin:eye-care"]) assert.ok(isPluginPage(name), name);
  for (const name of ["agents", "agentConnect", "messages", "plugins", "general"]) assert.equal(isPluginPage(name), false, name);
});
