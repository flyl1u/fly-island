import assert from "node:assert/strict";
import test from "node:test";
import { idleLabel, idleTextDisplay, normalizeIdleText, normalizeTodoPendingDisplay, IDLE_TEXT_MAX_LENGTH } from "../../src/features/appearance/idleText.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

const base = { showTitle: false, idleText: "", todoPendingDisplay: "pendingCount" };

test("idle text is trimmed, flattened and capped at 40 characters", () => {
  assert.equal(normalizeIdleText("  hello \n world  "), "hello world");
  assert.equal(normalizeIdleText(42), "");
  assert.equal(normalizeIdleText(null), "");
  assert.equal([...normalizeIdleText("字".repeat(60))].length, IDLE_TEXT_MAX_LENGTH);
  assert.equal(idleLabel(""), "fly-island");
  assert.equal(idleLabel("   "), "fly-island");
  assert.equal(idleLabel("专注中"), "专注中");
});

test("old settings read with their old meaning", () => {
  const old = normalizeSettings({ showTitle: true, showIdleTodoCount: true });
  assert.equal(old.idleText, "");
  assert.equal(old.todoPendingDisplay, "pendingCount");
  assert.equal(normalizeTodoPendingDisplay("nope"), "pendingCount");
  assert.equal(normalizeSettings({ idleText: "  专注 ", todoPendingDisplay: "idleText" }).idleText, "专注");
  // Defaults: nothing idle, count when pending.
  assert.deepEqual(idleTextDisplay(base, { itemShown: false, pendingLine: false }), { brand: null, pending: null });
  assert.deepEqual(idleTextDisplay({ ...base, showTitle: true }, { itemShown: false, pendingLine: false }), { brand: "fly-island", pending: null });
  assert.deepEqual(idleTextDisplay({ ...base, showTitle: true }, { itemShown: true, pendingLine: false }), { brand: "fly-island", pending: null });
});

test("a custom idle text shows only while nothing else does; pending can choose it", () => {
  const custom = { ...base, idleText: "专注中" };
  assert.deepEqual(idleTextDisplay(custom, { itemShown: false, pendingLine: false }), { brand: "专注中", pending: null });
  assert.deepEqual(idleTextDisplay(custom, { itemShown: true, pendingLine: false }), { brand: null, pending: null });
  const pending = { ...custom, todoPendingDisplay: "idleText" };
  assert.deepEqual(idleTextDisplay(pending, { itemShown: true, pendingLine: true }), { brand: null, pending: "专注中" });
  // Chosen but empty: falls back to fly-island, once (no duplicate title).
  assert.deepEqual(idleTextDisplay({ ...pending, idleText: "", showTitle: true }, { itemShown: true, pendingLine: true }), { brand: null, pending: "fly-island" });
  // The count stays when a todo is started (pendingLine false).
  assert.deepEqual(idleTextDisplay(pending, { itemShown: true, pendingLine: false }), { brand: null, pending: null });
});
