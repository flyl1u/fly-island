import assert from "node:assert/strict";
import test from "node:test";
import { nextCollapsedItem, resolveCollapsedItem } from "../../src/windows/island/collapsedItem.ts";

const order = ["agent", "todo", "lyrics"];
const all = { agent: true, todo: true, lyrics: true };

test("manual switches follow the saved order and wrap without respecting priority", () => {
  assert.equal(nextCollapsedItem(order, all, "agent"), "todo");
  assert.equal(nextCollapsedItem(order, all, "todo"), "lyrics");
  assert.equal(nextCollapsedItem(order, all, "lyrics"), "agent");
});

test("scrolling up walks the saved order backwards, wrapping and skipping unavailable items", () => {
  assert.equal(nextCollapsedItem(order, all, "agent", -1), "lyrics");
  assert.equal(nextCollapsedItem(order, all, "lyrics", -1), "todo");
  assert.equal(nextCollapsedItem(order, { ...all, todo: false }, "lyrics", -1), "agent");
  assert.equal(nextCollapsedItem(order, all, null, -1), "lyrics");
  assert.equal(nextCollapsedItem(order, { agent: true, todo: false, lyrics: false }, "agent", -1), null);
});

test("switching skips unavailable items and is a no-op with only one or none", () => {
  const noTodo = { ...all, todo: false };
  assert.equal(nextCollapsedItem(order, noTodo, "agent"), "lyrics");
  assert.equal(nextCollapsedItem(order, noTodo, "todo"), "lyrics");
  assert.equal(nextCollapsedItem(order, { ...noTodo, lyrics: false }, "agent"), null);
  assert.equal(nextCollapsedItem(order, { agent: false, todo: false, lyrics: false }, null), null);
});

test("an unavailable choice is forgotten rather than used when the item next becomes available", () => {
  const disappeared = resolveCollapsedItem(order, all, { ...all, lyrics: false }, "lyrics", false, false);
  assert.deepEqual(disappeared, { item: "agent", choice: null });
  assert.deepEqual(resolveCollapsedItem(order, all, all, disappeared.choice, false, false), disappeared);
});

test("a countdown wins automatic selection, but a manual choice can leave it running in the background", () => {
  assert.equal(resolveCollapsedItem(order, all, all, null, true, true).item, "todo");
  assert.equal(nextCollapsedItem(order, all, "todo"), "lyrics");
  assert.equal(resolveCollapsedItem(order, all, all, "lyrics", true, true).item, "lyrics");
  assert.equal(resolveCollapsedItem(order, all, { ...all, lyrics: false }, "lyrics", true, true).item, "todo");
});
