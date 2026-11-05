import assert from "node:assert/strict";
import test from "node:test";
import { filterMarketPlugins, repositoryUrl, usedCategories } from "../../src/features/plugins/marketFilter.ts";

const plugin = (id, extra = {}) => ({
  id,
  name: { "zh-CN": `${id} 中文`, en: `${id} English` },
  description: { "zh-CN": "番茄钟", en: "Pomodoro timer" },
  version: "1.0.0",
  apiVersion: 2,
  minAppVersion: null,
  author: "Someone",
  homepage: "",
  permissions: [],
  runtime: "powershell",
  download: { url: "https://x", sha256: "0".repeat(64), size: 1 },
  publisher: null,
  repo: null,
  categories: [],
  installedVersion: null,
  incompatible: null,
  revoked: null,
  ...extra,
});

const plugins = [
  plugin("a.timer", { categories: ["productivity"] }),
  plugin("b.music", { categories: ["media"], description: { "zh-CN": "正在播放", en: "Now playing" }, publisher: "ann" }),
];

test("the market filters by words in either language, publisher and category", () => {
  const ids = (filter) => filterMarketPlugins(plugins, filter, "TixXin").map((item) => item.id);
  assert.deepEqual(ids({ query: "", category: "" }), ["a.timer", "b.music"]);
  assert.deepEqual(ids({ query: "番茄", category: "" }), ["a.timer"]);
  assert.deepEqual(ids({ query: "NOW playing", category: "" }), ["b.music"]);
  assert.deepEqual(ids({ query: "ann", category: "" }), ["b.music"]);
  assert.deepEqual(ids({ query: "tixxin", category: "" }), ["a.timer"], "no publisher means the official one");
  assert.deepEqual(ids({ query: "", category: "media" }), ["b.music"]);
  assert.deepEqual(ids({ query: "timer", category: "media" }), []);
});

test("only categories in use are offered, and repositories become GitHub links", () => {
  assert.deepEqual(usedCategories(plugins, ["todos", "media", "productivity"]), ["media", "productivity"]);
  assert.equal(repositoryUrl("TixXin/fly-island"), "https://github.com/TixXin/fly-island");
  assert.equal(repositoryUrl("javascript:alert(1)"), null);
  assert.equal(repositoryUrl("a/b/c"), null);
  assert.equal(repositoryUrl(null), null);
});
