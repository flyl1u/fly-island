import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_COLLAPSED_ISLAND_WIDTH,
  MIN_COLLAPSED_ISLAND_WIDTH,
  alignCollapsedIslandWidth,
  getCollapsedIslandWidth,
  getTodoScrollStartRows,
  getTodoVisualRows,
} from "../src/windows/island/layout.ts";
import { ISLAND_POSITION_STORAGE_KEY, loadIslandPosition } from "../src/windows/island/storage.ts";

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

test("the todo list scrolls after as many rows as fit under the max panel height", () => {
  // 490px is the default and keeps the six rows the todo page always had.
  assert.equal(getTodoScrollStartRows(490), 6);
  assert.equal(getTodoScrollStartRows(306), 2);
  assert.equal(getTodoScrollStartRows(351), 2);
  assert.equal(getTodoScrollStartRows(352), 3);
  assert.equal(getTodoScrollStartRows(546), 7);
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
