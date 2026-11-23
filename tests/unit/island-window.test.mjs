import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_AUTO_COLLAPSED_ISLAND_WIDTH,
  MAX_COLLAPSED_ISLAND_WIDTH,
  MIN_COLLAPSED_ISLAND_WIDTH,
  alignCollapsedIslandWidth,
  getClipboardExpandedHeight,
  getCollapsedIslandWidth,
  getTodoScrollStartRows,
  getTodoVisualRows,
} from "../../src/windows/island/layout.ts";
import { ISLAND_POSITION_STORAGE_KEY, loadIslandPosition } from "../../src/windows/island/storage.ts";

function withStorage(entries, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map(entries);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key) => values.get(key) ?? null } } });
  try {
    run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
}

test("the collapsed island grows with its text between the min and max widths", () => {
  assert.equal(getCollapsedIslandWidth(""), MIN_COLLAPSED_ISLAND_WIDTH);
  assert.equal(getCollapsedIslandWidth("x".repeat(200)), MAX_AUTO_COLLAPSED_ISLAND_WIDTH);
  const mid = getCollapsedIslandWidth("abcdefg");
  assert.ok(mid > MIN_COLLAPSED_ISLAND_WIDTH && mid < MAX_COLLAPSED_ISLAND_WIDTH, String(mid));
  assert.equal(Number.isInteger(mid), true);
});

test("a long lyric line widens the collapsed island, but never past the max", () => {
  // The lyric decides the width now, so a long line is not cut short inside a narrow island.
  const short = getCollapsedIslandWidth("短句");
  const long = getCollapsedIslandWidth("这是一句很长的歌词".repeat(4));
  assert.ok(short >= MIN_COLLAPSED_ISLAND_WIDTH && short < long);
  assert.equal(long, MAX_AUTO_COLLAPSED_ISLAND_WIDTH);
});

test("plugin slots widen the collapsed island by the width they need, up to the max", () => {
  assert.equal(getCollapsedIslandWidth("", 42), MIN_COLLAPSED_ISLAND_WIDTH + 42);
  assert.equal(getCollapsedIslandWidth("", -10), MIN_COLLAPSED_ISLAND_WIDTH);
  assert.equal(getCollapsedIslandWidth("abcdefg", 1000), MAX_AUTO_COLLAPSED_ISLAND_WIDTH);
});

test("a lyric may widen the collapsed island to the width the settings allow", () => {
  // The lyric gets the whole width the user may pick (480), not the auto width's default (340).
  assert.equal(getCollapsedIslandWidth("这".repeat(40), 0, 1, MAX_COLLAPSED_ISLAND_WIDTH), MAX_COLLAPSED_ISLAND_WIDTH);
  // A short line keeps the width it had before.
  assert.equal(getCollapsedIslandWidth("这".repeat(12), 0, 1, MAX_COLLAPSED_ISLAND_WIDTH), MAX_AUTO_COLLAPSED_ISLAND_WIDTH);
  // A todo title or an agent session keeps the ordinary auto width: only the lyric widens.
  assert.equal(getCollapsedIslandWidth("这".repeat(40)), MAX_AUTO_COLLAPSED_ISLAND_WIDTH);
  // The cover beside the lyric comes out of that width, never past the ceiling.
  assert.equal(getCollapsedIslandWidth("这".repeat(40), 30, 1, MAX_COLLAPSED_ISLAND_WIDTH), MAX_COLLAPSED_ISLAND_WIDTH);
});

test("the todo list scrolls after as many rows as fit under the max panel height", () => {
  // 490px is the default: eight of the compact 38px rows fit under it (six of the old 46px ones did).
  assert.equal(getTodoScrollStartRows(490), 8);
  assert.equal(getTodoScrollStartRows(306), 3);
  assert.equal(getTodoScrollStartRows(333), 3);
  assert.equal(getTodoScrollStartRows(334), 4);
  assert.equal(getTodoScrollStartRows(546), 9);
});

test("the collapsed width is nudged so the centred island starts on a whole device pixel", () => {
  const leftEdge = (width, ratio) => ((820 - width) / 2) * ratio;
  // 301 is the width "剩余1个待办" produced: its centred left edge was 259.5px.
  assert.equal(alignCollapsedIslandWidth(301, 820, 1), 300);
  assert.equal(alignCollapsedIslandWidth(300, 820, 1), 300);
  for (const ratio of [1, 1.25, 1.5, 1.75, 2]) {
    for (let width = MIN_COLLAPSED_ISLAND_WIDTH; width <= MAX_COLLAPSED_ISLAND_WIDTH; width++) {
      const aligned = alignCollapsedIslandWidth(width, 820, ratio);
      assert.ok(Math.abs(aligned - width) <= 4, `${width} at ${ratio} -> ${aligned}`);
      assert.ok(aligned >= MIN_COLLAPSED_ISLAND_WIDTH && aligned <= MAX_COLLAPSED_ISLAND_WIDTH);
      assert.equal(Number.isInteger(leftEdge(aligned, ratio)), true, `${width} at ${ratio} -> ${aligned}`);
    }
  }
  // A ratio no nearby width can satisfy keeps the computed width.
  assert.equal(alignCollapsedIslandWidth(301, 820, 1.13), 301);
});

test("todo visual rows add up the estimated lines of every title", () => {
  const todo = (title) => ({ id: title, title, completed: false, createdAt: 0 });
  assert.equal(getTodoVisualRows([]), 0);
  assert.equal(getTodoVisualRows([todo("a"), todo("b")]), 2);
  assert.equal(getTodoVisualRows([todo("文".repeat(21))]), 2);
});

test("a stored island position is rounded and invalid data is ignored", () => {
  withStorage([[ISLAND_POSITION_STORAGE_KEY, JSON.stringify({ x: 10.6, y: -3.2 })]], () => {
    assert.deepEqual(loadIslandPosition(), { x: 11, y: -3 });
  });
  for (const value of [JSON.stringify({ x: "1", y: 2 }), JSON.stringify({ x: 1 }), JSON.stringify({ x: Infinity, y: 0 }), "{bad"]) {
    withStorage([[ISLAND_POSITION_STORAGE_KEY, value]], () => assert.equal(loadIslandPosition(), null, value));
  }
  withStorage([], () => assert.equal(loadIslandPosition(), null));
});

test("pages and message sources that are switched off fall back to ones still on", async () => {
  const { isPageEnabled, resolveIslandPage, resolveMessageSource } = await import("../../src/windows/island/features.ts");
  const all = { todo: true, music: true, clipboard: true, shelf: true, qq: true, wechat: true, qqMail: true };
  assert.equal(resolveIslandPage("music", all), "music");
  assert.equal(resolveIslandPage("todo", { ...all, todo: false }), "music");
  assert.equal(resolveIslandPage("todo", { ...all, todo: false, music: false, clipboard: false }), "shelf");
  assert.equal(resolveIslandPage("todo", { ...all, todo: false, music: false, clipboard: false, shelf: false }), "qq");
  // The messages page stays while any one of its sources is on.
  assert.equal(isPageEnabled("qq", { ...all, qq: false, wechat: false }), true);
  const none = { todo: false, music: false, clipboard: false, shelf: false, qq: false, wechat: false, qqMail: false };
  assert.equal(isPageEnabled("qq", none), false);
  assert.equal(resolveIslandPage("todo", none), null);
  assert.equal(resolveMessageSource("qq", { ...all, qq: false }), "wechat");
  assert.equal(resolveMessageSource("wechat", { ...all, qq: false, wechat: false }), "qqMail");
  assert.equal(resolveMessageSource("qqMail", none), "qqMail");
});

test("the clipboard page fits whole rows and stays short by default", () => {
  assert.equal(getClipboardExpandedHeight(3) - getClipboardExpandedHeight(2), 50);
  assert.equal(getClipboardExpandedHeight(4), 396);
});

test("a plugin's page is a page of its own, and disappears with the plugin", async () => {
  const { isPageEnabled, isPluginPage, pluginPageId, pluginPagesFrom, resolveIslandPage } = await import("../../src/windows/island/features.ts");
  const page = { page: "plugin:activity-progress", id: "activity-progress", name: { "zh-CN": "任务进度", en: "Task progress" }, icon: "gauge", rows: 2, actions: 1, attention: true };
  const features = { todo: true, music: true, clipboard: true, shelf: true, qq: true, wechat: true, qqMail: true, pluginPages: [page] };
  assert.equal(pluginPageId("activity-progress"), "plugin:activity-progress");
  assert.equal(isPluginPage("plugin:activity-progress"), true);
  assert.equal(isPluginPage("music"), false);
  assert.equal(isPageEnabled(page.page, features), true);
  assert.equal(resolveIslandPage(page.page, features), page.page);
  // Switching the plugin off must land on a built-in page, not on a blank island.
  assert.equal(resolveIslandPage(page.page, { ...features, pluginPages: [] }), "todo");
  assert.equal(isPageEnabled(page.page, { ...features, pluginPages: [] }), false);
});

test("only enabled plugins that declare a page get one", async () => {
  const { pluginPagesFrom } = await import("../../src/windows/island/features.ts");
  const manifest = (id, panel, contributes = ["panel"]) => ({
    id, name: { "zh-CN": id, en: id }, description: { "zh-CN": id, en: id }, version: "0.1.0", apiVersion: 1,
    runtime: { command: `${id}.exe` }, permissions: contributes, contributes, settings: [], actions: [],
    ...(panel ? { panel } : {}),
  });
  const installed = {
    "activity-progress": { manifest: manifest("activity-progress", { icon: "gauge" }), enabled: true, directory: "", development: false, settings: {} },
    "drink-water": { manifest: manifest("drink-water", { icon: "heart-pulse" }), enabled: true, directory: "", development: false, settings: {} },
    off: { manifest: manifest("off", { icon: "timer" }), enabled: false, directory: "", development: false, settings: {} },
    plain: { manifest: manifest("plain", undefined, ["notifications"]), enabled: true, directory: "", development: false, settings: {} },
    "odd-icon": { manifest: manifest("odd-icon", { icon: "usb" }), enabled: true, directory: "", development: false, settings: {} },
  };
  const live = {
    "activity-progress": {
      status: "running", quota: [], sessions: [], notifications: [],
      panel: { headline: "2 项任务", note: null, rows: [{ id: "a" }, { id: "b" }], actions: ["refresh"], attention: true },
    },
  };
  const pages = pluginPagesFrom(installed, live);
  assert.deepEqual(pages.map((info) => info.id), ["activity-progress", "drink-water", "odd-icon"]);
  const progress = pages[0];
  assert.equal(progress.page, "plugin:activity-progress");
  assert.equal(progress.rows, 2, "the page fits the rows the plugin reports");
  assert.equal(progress.actions, 1);
  assert.equal(progress.attention, true, "a task needing attention puts a dot on the page's button");
  assert.equal(pages[1].rows, 0, "a plugin that has not published yet still has a page");
  assert.equal(pages[2].icon, "puzzle", "an unknown icon falls back to the host's");
});

test("a clipboard opened in its own window is not kept as the island's page", async () => {
  const { islandPageFor } = await import("../../src/windows/island/features.ts");
  const all = { todo: true, music: true, clipboard: true, shelf: true, qq: true, wechat: true, qqMail: true };
  assert.equal(islandPageFor("clipboard", all, false), "clipboard");
  // Remembered clipboard page + separate window: the next click on the island opens a real page.
  assert.equal(islandPageFor("clipboard", all, true), "todo");
  assert.equal(islandPageFor("clipboard", { ...all, todo: false, music: false }, true), "shelf");
  assert.equal(islandPageFor("music", all, true), "music");
});
