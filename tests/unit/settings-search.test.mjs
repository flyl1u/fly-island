import assert from "node:assert/strict";
import test from "node:test";
import { searchCategories } from "../../src/windows/settings/categories.ts";
import { isTitleHit, normalizeSearchText, searchSettingsRows, searchWords } from "../../src/windows/settings/settingsSearch.ts";
import { mergeStates, pairLocales } from "../../scripts/settings-search-index.mjs";

const LOCALES = ["zh-CN", "en"];
const row = (page, zh, en) => ({ page, "zh-CN": zh, en });
const ENTRIES = [
  row("agents", { group: "会话列表", title: "隐藏已退出的会话", description: "按进程是否还在判断" }, { group: "Session list", title: "Hide sessions that have quit", description: "Told by whether the process is alive" }),
  row("agents", { group: "会话卡片", title: "会话来源", options: ["只显示图标", "图标和名称"] }, { group: "Session cards", title: "Session source", options: ["Icon only", "Icon and name"] }),
  row("agentAlerts", { group: "弹出提醒", title: "会话完成时" }, { group: "Pop-up alerts", title: "When a session finishes" }),
];
const PAGES = { agents: "会话 AI Agent", agentAlerts: "弹出提醒 AI Agent 弹出 提醒" };
const search = (query, locale = "zh-CN") => searchSettingsRows(query, ENTRIES, locale, LOCALES, (page) => PAGES[page]);

test("search text ignores case, width, spaces and punctuation", () => {
  assert.equal(normalizeSearchText(" Auto-Tuck　ＡＢ 弹出 提醒。"), "autotuckab弹出提醒");
  assert.deepEqual(searchWords("  弹出 提醒 "), ["弹出", "提醒"]);
});

test("a title beats a choice, which beats a description", () => {
  assert.deepEqual(search("会话").map((hit) => hit.text.title), ["隐藏已退出的会话", "会话来源", "会话完成时"]);
  assert.deepEqual(search("图标").map((hit) => hit.text.title), ["会话来源"]);
  assert.deepEqual(search("进程").map((hit) => hit.text.title), ["隐藏已退出的会话"]);
  assert.ok(search("会话来源")[0].score > search("图标")[0].score);
});

test("any language finds a row, shown in the language asked for", () => {
  assert.deepEqual(search("hide sessions").map((hit) => hit.text.title), ["隐藏已退出的会话"]);
  assert.deepEqual(search("隐藏", "en").map((hit) => hit.text.title), ["Hide sessions that have quit"]);
});

test("every word must match; the page's own text helps but cannot stand alone", () => {
  assert.deepEqual(search("弹出 完成").map((hit) => hit.page), ["agentAlerts"]);
  assert.deepEqual(search("弹出"), [], "a page's name alone lists no rows");
  assert.deepEqual(search("会话 不存在"), []);
});

test("Enter opens a row only when the query is in its title", () => {
  assert.ok(isTitleHit(search("会话来源")[0], "会话来源"));
  assert.ok(!isTitleHit(search("进程")[0], "进程"));
  assert.ok(!isTitleHit(undefined, "x"));
});

test("pages match words written together or apart", () => {
  const describe = (page) => (page === "agentAlerts" ? "弹出提醒 AI Agent 弹出 提醒 通知" : "");
  assert.ok(searchCategories("弹出提醒", describe).includes("agentAlerts"));
  assert.ok(searchCategories("弹出 通知", describe).includes("agentAlerts"));
});

test("the index keeps each row once and pairs the languages row by row", () => {
  const on = [{ page: "agents", group: "g", title: "a" }, { page: "agents", group: "g", title: "b" }];
  const defaults = [{ page: "agents", group: "g", title: "a" }, { page: "agents", group: "g", title: "c" }];
  assert.deepEqual(mergeStates([on, defaults]).map((entry) => entry.title), ["a", "b", "c"]);
  const paired = pairLocales({ "zh-CN": [{ page: "agents", group: "组", title: "甲" }], en: [{ page: "agents", group: "G", title: "A" }] });
  assert.deepEqual(paired, [{ page: "agents", "zh-CN": { group: "组", title: "甲" }, en: { group: "G", title: "A" } }]);
  assert.throws(() => pairLocales({ "zh-CN": [{ page: "agents", group: "", title: "x" }], en: [] }));
  assert.throws(() => pairLocales({ "zh-CN": [{ page: "agents", group: "", title: "x" }], en: [{ page: "about", group: "", title: "x" }] }));
});
