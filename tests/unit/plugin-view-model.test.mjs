import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { VIEW_ICON_NAMES } from "../../src/features/plugin-views/iconNames.ts";
import {
  filterListGroups,
  listRowCount,
  normalizeListModel,
  parsePluginPageId,
  pluginPageId,
  readLink,
  readText,
  MAX_LIST_ITEMS,
} from "../../src/features/plugin-views/model.ts";

test("view icons match the manifest schema", () => {
  const schema = JSON.parse(readFileSync(new URL("../../plugins/schema/manifest.schema.json", import.meta.url), "utf8"));
  assert.deepEqual([...VIEW_ICON_NAMES], schema.properties.contributes.properties.views.items.properties.icon.enum);
});

test("page ids round-trip, plugin ids may contain dots", () => {
  const page = pluginPageId("dev.focusd.github-issues", "issues");
  assert.equal(page, "plugin:dev.focusd.github-issues/issues");
  assert.deepEqual(parsePluginPageId(page), { pluginId: "dev.focusd.github-issues", viewId: "issues" });
  for (const bad of ["todo", "plugin:", "plugin:x/", "plugin:/v"]) assert.equal(parsePluginPageId(bad), null, bad);
});

test("texts pick the island language, fall back to the other one and are cut", () => {
  assert.equal(readText({ "zh-CN": "看板", en: "Board" }, "en", 10), "Board");
  assert.equal(readText({ "zh-CN": "看板", en: "" }, "en", 10), "看板");
  assert.equal(readText("  plain  ", "zh-CN", 10), "plain");
  assert.equal(readText("abcdef", "en", 4), "abc…");
  assert.equal(readText(5, "en", 4), null);
  assert.equal(readText("   ", "en", 4), null);
});

test("only https links are kept", () => {
  assert.equal(readLink("https://github.com/x/y/issues/1"), "https://github.com/x/y/issues/1");
  for (const bad of ["http://x.com", "javascript:alert(1)", "https://", "file:///C:/x", 3]) assert.equal(readLink(bad), null, String(bad));
});

test("lists drop bad items, keep groups, limit actions and items", () => {
  const model = normalizeListModel(
    {
      items: [
        { id: "a", title: "First", subtitle: { "zh-CN": "副", en: "Sub" }, checked: true, url: "javascript:x", actions: [
          { id: "1", title: "One" }, { id: "2", title: "Two" }, { id: "3", title: "Three" }, { id: "4", title: "Four" },
        ] },
        { id: "a", title: "Duplicate" },
        { id: "bad id", title: "Space in id" },
        { title: "No id" },
        { id: "<b>", title: "<b>html</b>" },
      ],
      groups: [{ title: "Later", items: [{ id: "b", title: "Second", url: "https://example.com", icon: "<svg/>" }] }, { title: "Empty", items: [] }],
      search: { mode: "remote" },
      loading: "yes",
    },
    "en",
  );
  assert.deepEqual(model.groups.map((group) => [group.title, group.items.map((item) => item.id)]), [[null, ["a"]], ["Later", ["b"]]]);
  const [first] = model.groups[0].items;
  assert.deepEqual([first.subtitle, first.checked, first.url, first.actions.map((action) => action.id)], ["Sub", true, null, ["1", "2", "3"]]);
  assert.deepEqual([model.groups[1].items[0].url, model.groups[1].items[0].icon], ["https://example.com", null]);
  assert.deepEqual([model.loading, model.search], [false, { placeholder: null, mode: "remote" }]);
  assert.equal(listRowCount(model.groups), 3);

  const many = normalizeListModel({ items: Array.from({ length: MAX_LIST_ITEMS + 50 }, (_, n) => ({ id: `i${n}`, title: `Item ${n}` })) }, "en");
  assert.equal(many.groups[0].items.length, MAX_LIST_ITEMS);
  assert.deepEqual(normalizeListModel("junk", "en"), { groups: [], empty: null, loading: false, error: null, search: null });
});

test("local search matches title, subtitle and note in any case", () => {
  const { groups } = normalizeListModel(
    { items: [{ id: "a", title: "Fix Bug" }, { id: "b", title: "x", note: "BUG-2" }, { id: "c", title: "Other" }] },
    "en",
  );
  assert.deepEqual(filterListGroups(groups, "bug")[0].items.map((item) => item.id), ["a", "b"]);
  assert.equal(filterListGroups(groups, "nothing").length, 0);
  assert.equal(filterListGroups(groups, "  "), groups);
});
