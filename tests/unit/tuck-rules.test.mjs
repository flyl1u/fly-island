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
  const activity = { agentVisualState: "idle", activeAgentSessionCount: 0, collapsedItem: "todo", songPlaying: false, activeTodoId: null,
    timer: { endsAt: 5000 } };
  assert.equal(keepIslandVisible(settings, activity, 1000), true);
  assert.equal(keepVisibleChangesAt(settings, activity, 1000), 5000);
  assert.equal(keepIslandVisible(settings, activity, 5000), false);
  assert.equal(keepVisibleChangesAt(settings, activity, 5000), null);
  assert.equal(keepVisibleChangesAt(settings, { ...activity, activeTodoId: "a" }, 1000), null, "a started todo holds without end");
  assert.equal(keepVisibleChangesAt({ ...settings, keepVisibleWhileTodoRunning: false }, activity, 1000), null);
});

test("canAutoTuck: each automatic reason follows its own setting", async () => {
  const { canAutoTuck } = await import("../../src/windows/island/tuckRules.ts");
  const base = { neverAutoTuck: false, autoTuck: true, gameAutoTuck: false, browserAutoTuck: false };
  assert.equal(canAutoTuck(base, "idle_timer"), true);
  assert.equal(canAutoTuck({ ...base, autoTuck: false }, "idle_timer"), false);
  assert.equal(canAutoTuck(base, "game_mode"), false);
  assert.equal(canAutoTuck({ ...base, gameAutoTuck: true }, "game_mode"), true);
  assert.equal(canAutoTuck(base, "browser"), false);
  assert.equal(canAutoTuck({ ...base, browserAutoTuck: true }, "browser"), true);
});

test("neverAutoTuck blocks every automatic tuck whatever the other switches say", async () => {
  const { canAutoTuck } = await import("../../src/windows/island/tuckRules.ts");
  const all = { neverAutoTuck: true, autoTuck: true, gameAutoTuck: true, browserAutoTuck: true };
  for (const reason of ["idle_timer", "game_mode", "browser"]) assert.equal(canAutoTuck(all, reason), false);
});

test("right click tucks only the collapsed, untucked island", async () => {
  const { rightClickTucks } = await import("../../src/windows/island/tuckRules.ts");
  assert.equal(rightClickTucks("collapsed", false), true);
  assert.equal(rightClickTucks("collapsed", true), false);
  assert.equal(rightClickTucks("expanded", false), false);
});

test("the idle plan and game mode honour neverAutoTuck", async () => {
  const { idlePlan } = await import("../../src/windows/island/idleCollapse.ts");
  const { gameModeEffects } = await import("../../src/windows/island/gameMode.ts");
  const settings = { autoTuck: true, neverAutoTuck: true, gameAutoTuck: true, tuckDelaySeconds: 30, autoCollapseSeconds: 30 };
  assert.equal(idlePlan("collapsed", settings, false), null);
  assert.deepEqual(idlePlan("expanded", settings, false), { seconds: 30, action: "collapse" });
  const fullscreen = { active: true, onIslandMonitor: true, browserOnIslandMonitor: true };
  const on = { gameDoNotDisturb: true, gameAutoTuck: true, browserAutoTuck: true };
  assert.deepEqual(gameModeEffects(fullscreen, { ...on, neverAutoTuck: true }), { quiet: true, tuck: false, browserOnIslandMonitor: false });
  assert.deepEqual(gameModeEffects(fullscreen, on), { quiet: true, tuck: true, browserOnIslandMonitor: true });
  assert.equal(gameModeEffects(fullscreen, { ...on, browserAutoTuck: false }).browserOnIslandMonitor, false);
});
