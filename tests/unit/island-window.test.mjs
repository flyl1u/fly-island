import assert from "node:assert/strict";
import test from "node:test";
import {
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
  assert.equal(getCollapsedIslandWidth("x".repeat(200)), MAX_COLLAPSED_ISLAND_WIDTH);
  const mid = getCollapsedIslandWidth("abcdefg");
  assert.ok(mid > MIN_COLLAPSED_ISLAND_WIDTH && mid < MAX_COLLAPSED_ISLAND_WIDTH, String(mid));
  assert.equal(Number.isInteger(mid), true);
});

test("plugin slots widen the collapsed island by the width they need, up to the max", () => {
  assert.equal(getCollapsedIslandWidth("", 42), MIN_COLLAPSED_ISLAND_WIDTH + 42);
  assert.equal(getCollapsedIslandWidth("", -10), MIN_COLLAPSED_ISLAND_WIDTH);
  assert.equal(getCollapsedIslandWidth("abcdefg", 1000), MAX_COLLAPSED_ISLAND_WIDTH);
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

test("a clipboard opened in its own window is not kept as the island's page", async () => {
  const { islandPageFor } = await import("../../src/windows/island/features.ts");
  const all = { todo: true, music: true, clipboard: true, shelf: true, qq: true, wechat: true, qqMail: true };
  assert.equal(islandPageFor("clipboard", all, false), "clipboard");
  // Remembered clipboard page + separate window: the next click on the island opens a real page.
  assert.equal(islandPageFor("clipboard", all, true), "todo");
  assert.equal(islandPageFor("clipboard", { ...all, todo: false, music: false }, true), "shelf");
  assert.equal(islandPageFor("music", all, true), "music");
});
