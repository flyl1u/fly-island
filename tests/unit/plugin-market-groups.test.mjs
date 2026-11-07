import assert from "node:assert/strict";
import test from "node:test";
import { groupMarketPlugins, pluginIconTone, pluginInitial } from "../../src/features/plugins/marketGroups.ts";

const plugin = (id, installedVersion = null, version = "1.0.0") => ({ id, installedVersion, version, categories: [] });

test("updates, installable and current installed plugins are grouped apart", () => {
  const { updates, installable, installed } = groupMarketPlugins([
    plugin("a.current", "1.0.0"),
    plugin("a.new"),
    plugin("a.update", "1.0.0", "1.1.0"),
    plugin("b.new"),
  ]);
  assert.deepEqual(installable.map((item) => item.id), ["a.new", "b.new"]);
  assert.deepEqual(updates.map((item) => item.id), ["a.update"]);
  assert.deepEqual(installed.map((item) => item.id), ["a.current"]);
});

test("the icon letter is the first letter of the name", () => {
  assert.equal(pluginInitial("pomodoro"), "P");
  assert.equal(pluginInitial("番茄钟"), "番");
  assert.equal(pluginInitial("「正在播放」"), "正");
  assert.equal(pluginInitial(""), "?");
});

test("the icon colour follows the category, else stays the same for an id", () => {
  assert.equal(pluginIconTone({ id: "x", categories: ["games", "media"] }), "media");
  const tone = pluginIconTone({ id: "com.example.clock", categories: [] });
  assert.equal(pluginIconTone({ id: "com.example.clock", categories: [] }), tone);
});
