import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_COLLAPSED_ISLAND_WIDTH,
  MIN_COLLAPSED_ISLAND_WIDTH,
  getCollapsedIslandWidth,
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
