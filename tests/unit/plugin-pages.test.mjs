import assert from "node:assert/strict";
import test from "node:test";
import {
  cycleShortcutPage,
  isPageEnabled,
  isPluginPage,
  pageForAltDigit,
  pageShortcutLabel,
  pageShortcutOrder,
  resolveIslandPage,
} from "../../src/windows/island/features.ts";
import { getPluginPageExpandedHeight } from "../../src/windows/island/layout.ts";

const all = { agents: true, todo: true, music: true, clipboard: true, shelf: true, qq: true, wechat: false, qqMail: false, translation: false };
const board = "plugin:dev.example.board/board";
const timer = "plugin:dev.example.pomodoro/timer";

test("without plugin pages the page order is what it was", () => {
  const withEmpty = { ...all, pluginPages: [] };
  assert.deepEqual(pageShortcutOrder(withEmpty), pageShortcutOrder(all));
  assert.deepEqual(pageShortcutOrder(all), ["agents", "todo", "music", "clipboard", "shelf", "qq"]);
  assert.equal(pageForAltDigit(withEmpty, 7), null);
});

test("plugin pages come after the built-in pages, in the order given", () => {
  const features = { ...all, pluginPages: [timer, board] };
  assert.equal(pageForAltDigit(features, 7), timer);
  assert.equal(pageForAltDigit(features, 8), board);
  assert.equal(pageShortcutLabel(features, board, "Alt"), "Alt+8");
  assert.equal(cycleShortcutPage(features, "qq", 1), timer);
  assert.equal(cycleShortcutPage(features, board, 1), "agents");
  assert.equal(cycleShortcutPage(features, "agents", -1), board);
  // Past the ninth page there is no number key, so no label either.
  const many = { ...features, pluginPages: [timer, board, "plugin:c/1", "plugin:d/1"] };
  assert.equal(pageShortcutLabel(many, "plugin:c/1", "Alt"), "Alt+9");
  assert.equal(pageShortcutLabel(many, "plugin:d/1", "Alt"), null);
  // Built-in pages switched off leave no gap.
  assert.equal(pageForAltDigit({ ...features, agents: false, music: false }, 5), timer);
});

test("a plugin page is on while its plugin lists it; otherwise the island falls back", () => {
  const features = { ...all, pluginPages: [board] };
  assert.equal(isPluginPage(board), true);
  assert.equal(isPluginPage("todo"), false);
  assert.equal(isPageEnabled(board, features), true);
  assert.equal(isPageEnabled(timer, features), false);
  assert.equal(resolveIslandPage(timer, features), "todo");
  const onlyPlugin = { todo: false, music: false, clipboard: false, shelf: false, qq: false, wechat: false, qqMail: false, agents: false, translation: false, pluginPages: [board] };
  assert.equal(resolveIslandPage("todo", onlyPlugin), board);
});

test("plugin pages get a height by template, within the panel limit", () => {
  assert.equal(getPluginPageExpandedHeight("status", 1000), 260);
  assert.equal(getPluginPageExpandedHeight("list", 1000), 400);
  assert.equal(getPluginPageExpandedHeight("list", 320), 320);
  assert.equal(getPluginPageExpandedHeight(null, 1000), 400);
  // A list grows with its rows between 2 and 8, then scrolls.
  assert.equal(getPluginPageExpandedHeight("list", 1000, 0), getPluginPageExpandedHeight("list", 1000, 2));
  assert.equal(getPluginPageExpandedHeight("list", 1000, 4) - getPluginPageExpandedHeight("list", 1000, 3), 40);
  assert.equal(getPluginPageExpandedHeight("list", 1000, 50), getPluginPageExpandedHeight("list", 1000, 8));
  assert.equal(getPluginPageExpandedHeight("list", 300, 8), 300);
});

test("the collapsed bar shows the status text with the highest priority, first plugin on ties", async () => {
  const { topStatusItem } = await import("../../src/features/plugin-views/statusItems.ts");
  const entry = (pluginId, priority, text = "x") => ({ pluginId, itemId: "t", priority, text, tooltip: null, tone: "neutral" });
  assert.equal(topStatusItem([]), null);
  assert.equal(topStatusItem([entry("a", 1), entry("b", 5), entry("c", 5)]).pluginId, "b");
  assert.equal(topStatusItem([entry("a", -3), entry("b", -1)]).pluginId, "b");
  assert.equal(topStatusItem([entry("a", 9, "")]), null);
});

test("plugin page preferences order and hide pages, and bad stored data means defaults", async () => {
  const { movePluginPage, normalizePluginPagePrefs, orderPluginViews, setPluginPageHidden, visiblePluginViews } = await import("../../src/features/plugin-views/pagePrefs.ts");
  const view = (pluginId, viewId) => ({ pluginId, viewId, pluginName: { "zh-CN": "p", en: "p" }, title: { "zh-CN": "t", en: "t" }, icon: "list", template: "list", status: "running", error: null });
  const views = [view("a.one", "x"), view("b.two", "y"), view("c.three", "z")];
  const ids = (list) => list.map((item) => `${item.pluginId}/${item.viewId}`);

  assert.deepEqual(normalizePluginPagePrefs("junk"), { order: [], hidden: [] });
  assert.deepEqual(normalizePluginPagePrefs({ order: ["plugin:a/x", "todo", 5, "plugin:a/x"], hidden: "no" }), { order: ["plugin:a/x"], hidden: [] });

  let prefs = normalizePluginPagePrefs(undefined);
  assert.deepEqual(ids(orderPluginViews(views, prefs)), ["a.one/x", "b.two/y", "c.three/z"]);
  prefs = movePluginPage(views, prefs, "plugin:c.three/z", -1);
  assert.deepEqual(ids(orderPluginViews(views, prefs)), ["a.one/x", "c.three/z", "b.two/y"]);
  assert.equal(movePluginPage(views, prefs, "plugin:a.one/x", -1), prefs, "the first page cannot move up");
  prefs = setPluginPageHidden(prefs, "plugin:a.one/x", true);
  assert.deepEqual(ids(visiblePluginViews(views, prefs)), ["c.three/z", "b.two/y"]);
  // A page whose plugin is off keeps its place for when it comes back.
  const withGone = { ...prefs, order: ["plugin:gone/q", ...prefs.order] };
  assert.ok(movePluginPage(views, withGone, "plugin:b.two/y", -1).order.includes("plugin:gone/q"));
  assert.deepEqual(ids(visiblePluginViews(views, setPluginPageHidden(prefs, "plugin:a.one/x", false))), ["a.one/x", "c.three/z", "b.two/y"]);
});
