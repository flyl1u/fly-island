import assert from "node:assert/strict";
import test from "node:test";
import { crossedReorderMidpoint, moveItem, normalizeOrder } from "../../src/utils/order.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

const ITEMS = ["agent", "lyrics", "todo"];

test("a saved order keeps known items once, and gains the ones it lacks at the end", () => {
  assert.deepEqual(normalizeOrder(["todo", "agent"], ITEMS), ["todo", "agent", "lyrics"]);
  assert.deepEqual(normalizeOrder(["todo", "todo", "x", 3, "agent"], ITEMS), ["todo", "agent", "lyrics"]);
  assert.deepEqual(normalizeOrder("todo", ITEMS), ITEMS);
  assert.deepEqual(normalizeOrder(undefined, ITEMS), ITEMS);
});

test("moving an item puts it at the new index and leaves the rest in order", () => {
  assert.deepEqual(moveItem(ITEMS, "agent", 2), ["lyrics", "todo", "agent"]);
  assert.deepEqual(moveItem(ITEMS, "todo", 0), ["todo", "agent", "lyrics"]);
  assert.deepEqual(moveItem(ITEMS, "todo", 9), ["agent", "lyrics", "todo"]);
  assert.equal(moveItem(ITEMS, "lyrics", 1), ITEMS);
  assert.equal(moveItem(ITEMS, "missing", 0), ITEMS);
});

test("crossing the target midpoint keeps unequal widths from swapping back on the same drag", () => {
  assert.equal(crossedReorderMidpoint(141, 100, 180, true), false);
  assert.equal(crossedReorderMidpoint(140, 100, 180, true), true);
  // The wider target moved 28px to the right when the narrow button was inserted before it.
  assert.equal(crossedReorderMidpoint(139, 128, 208, false), false);
  assert.equal(crossedReorderMidpoint(168, 128, 208, false), true);
});

test("the collapsed island's order, cover and the page dots load with defaults", () => {
  const settings = normalizeSettings({});
  assert.deepEqual(settings.collapsedPriority, ["agent", "lyrics", "todo", "centeredClock"]);
  assert.equal(settings.collapsedShowCover, true);
  assert.equal(normalizeSettings({ collapsedShowCover: false }).collapsedShowCover, false);
  assert.deepEqual(settings.pageOrder, ["todo", "music", "clipboard", "shelf", "translation"]);
  const saved = normalizeSettings({ collapsedPriority: ["todo"], collapsedShowCover: true, pageOrder: ["shelf", "todo"] });
  assert.deepEqual(saved.collapsedPriority, ["todo", "agent", "lyrics", "centeredClock"]);
  assert.equal(saved.collapsedShowCover, true);
  // Orders saved before translation had a capsule get it at the end.
  assert.deepEqual(saved.pageOrder, ["shelf", "todo", "music", "clipboard", "translation"]);
});

test("page buttons keep each supported style and default to icons", () => {
  assert.equal(normalizeSettings({}).pageButtonStyle, "icon");
  assert.equal(normalizeSettings({ pageButtonStyle: "capsule" }).pageButtonStyle, "capsule");
  assert.equal(normalizeSettings({ pageButtonStyle: "icon" }).pageButtonStyle, "icon");
  assert.equal(normalizeSettings({ pageButtonStyle: "iconLabel" }).pageButtonStyle, "iconLabel");
  assert.equal(normalizeSettings({ pageButtonStyle: "unknown" }).pageButtonStyle, "icon");
});
