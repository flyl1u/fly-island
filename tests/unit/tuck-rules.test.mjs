import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings.ts";
import { keepIslandVisible, keepVisibleChangesAt } from "../../src/windows/island/keepVisible.ts";
import { retractsPeek, revealsForKeepVisible } from "../../src/windows/island/tuckRules.ts";

const base = { isTucked: true, isPeeking: false, tuckedAutomatically: true, keepVisible: true,
  hasMessagePreview: false, isPreviewing: false, gameHolds: false };

test("an island that tucked itself comes back out when a keep-visible activity starts", () => {
  assert.equal(revealsForKeepVisible(base), true);
  assert.equal(revealsForKeepVisible({ ...base, keepVisible: false }), false, "nothing to stay visible for");
  assert.equal(revealsForKeepVisible({ ...base, isTucked: false }), false, "already out");
});

test("tucks by the user or game mode are never undone", () => {
  assert.equal(revealsForKeepVisible({ ...base, tuckedAutomatically: false }), false, "minimized or dragged to the edge");
  assert.equal(revealsForKeepVisible({ ...base, gameHolds: true }), false, "game mode");
  assert.equal(revealsForKeepVisible({ ...base, isPreviewing: true }), false, "settings preview");
});

test("a peek slides back unless a preview or a keep-visible activity holds an auto-tucked island", () => {
  const peeking = { ...base, isTucked: false, isPeeking: true, keepVisible: false };
  assert.equal(retractsPeek(peeking), true);
  assert.equal(retractsPeek({ ...peeking, hasMessagePreview: true }), false, "message still showing");
  assert.equal(retractsPeek({ ...peeking, keepVisible: true }), false, "lyrics after a message peek");
  assert.equal(retractsPeek({ ...peeking, keepVisible: true, tuckedAutomatically: false }), true, "minimized: peeks only");
  assert.equal(retractsPeek({ ...peeking, isPeeking: false }), false);
});

test("a todo timer that holds the island is re-checked when it runs out", () => {
  const settings = { ...DEFAULT_SETTINGS, keepVisibleWhileTodoRunning: true, todoEnabled: true };
  const activity = { agentVisualState: "idle", collapsedItem: "todo", songPlaying: false, activeTodoId: null,
    timer: { endsAt: 5000 } };
  assert.equal(keepIslandVisible(settings, activity, 1000), true);
  assert.equal(keepVisibleChangesAt(settings, activity, 1000), 5000);
  assert.equal(keepIslandVisible(settings, activity, 5000), false);
  assert.equal(keepVisibleChangesAt(settings, activity, 5000), null);
  assert.equal(keepVisibleChangesAt(settings, { ...activity, activeTodoId: "a" }, 1000), null, "a started todo holds without end");
  assert.equal(keepVisibleChangesAt({ ...settings, keepVisibleWhileTodoRunning: false }, activity, 1000), null);
});
