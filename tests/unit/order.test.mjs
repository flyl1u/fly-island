import assert from "node:assert/strict";
import test from "node:test";
import { moveItem, normalizeOrder } from "../../src/utils/order.ts";
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

test("the collapsed island's order, cover and the page dots load with defaults", () => {
  const settings = normalizeSettings({});
  assert.deepEqual(settings.collapsedPriority, ["agent", "lyrics", "todo", "balance", "clock"]);
  assert.equal(settings.collapsedShowCover, true);
  assert.equal(normalizeSettings({ collapsedShowCover: false }).collapsedShowCover, false);
  assert.deepEqual(settings.pageOrder, ["todo", "music", "clipboard", "shelf", "translation"]);
  const saved = normalizeSettings({ collapsedPriority: ["todo"], collapsedShowCover: true, pageOrder: ["shelf", "todo"] });
  assert.deepEqual(saved.collapsedPriority, ["todo", "agent", "lyrics", "balance", "clock"]);
  assert.equal(saved.collapsedShowCover, true);
  // Orders saved before translation had a capsule get it at the end.
  assert.deepEqual(saved.pageOrder, ["shelf", "todo", "music", "clipboard", "translation"]);
});

test("clock order and the collapsed balance preference survive settings normalization", () => {
  const collapsedPriority = ["clock", "balance", "todo", "lyrics", "agent"];
  const saved = normalizeSettings({ collapsedPriority, balanceShowCollapsed: false });
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(saved))).collapsedPriority, collapsedPriority);
  assert.equal(normalizeSettings(JSON.parse(JSON.stringify(saved))).balanceShowCollapsed, false);
  assert.equal(normalizeSettings({}).balanceShowCollapsed, true);
  assert.equal(normalizeSettings({ balanceShowCollapsed: true }).balanceShowCollapsed, true);
  for (const value of [null, 0, "false"]) assert.equal(normalizeSettings({ balanceShowCollapsed: value }).balanceShowCollapsed, true);
  assert.deepEqual(normalizeSettings({ collapsedPriority: ["clock", "clock", "unknown", "balance"] }).collapsedPriority,
    ["clock", "balance", "agent", "lyrics", "todo"]);
});

test("page buttons default to icons; a saved capsule choice is kept", () => {
  assert.equal(normalizeSettings({}).pageButtonStyle, "icon");
  assert.equal(normalizeSettings({ pageButtonStyle: "capsule" }).pageButtonStyle, "capsule");
  assert.equal(normalizeSettings({ pageButtonStyle: "icon" }).pageButtonStyle, "icon");
});
