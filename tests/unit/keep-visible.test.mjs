import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/features/appearance/settings.ts";
import { keepIslandVisible } from "../../src/windows/island/keepVisible.ts";
import { idlePlan } from "../../src/windows/island/idleCollapse.ts";

const activity = { agentVisualState: "idle", collapsedItem: "todo", songPlaying: false, activeTodoId: null, timer: null };
const stays = (patch, state) => keepIslandVisible({ ...DEFAULT_SETTINGS, ...patch }, { ...activity, ...state }, 1000);

test("keep-visible switches default off and normalize only booleans independently", () => {
  for (const field of ["keepVisibleWhileAgentRunning", "keepVisibleWhileLyrics", "keepVisibleWhileTodoRunning"]) {
    assert.equal(DEFAULT_SETTINGS[field], false);
    for (const value of [undefined, "true", 1, null, false]) assert.equal(normalizeSettings({ [field]: value })[field], false);
    assert.equal(normalizeSettings({ [field]: true })[field], true);
  }
  assert.equal(stays({}, { agentVisualState: "running", collapsedItem: "lyrics", songPlaying: true, activeTodoId: "a" }), false);
});

test("only running agents hold the island, independently of which text is displayed", () => {
  assert.equal(stays({ keepVisibleWhileAgentRunning: true }, { agentVisualState: "running" }), true);
  for (const state of ["idle", "waiting", "completed", "failed"]) {
    assert.equal(stays({ keepVisibleWhileAgentRunning: true }, { agentVisualState: state }), false);
  }
});

test("lyrics hold the island only while visible and playing", () => {
  const settings = { keepVisibleWhileLyrics: true };
  const playing = { collapsedItem: "lyrics", songPlaying: true };
  assert.equal(stays(settings, playing), true);
  assert.equal(stays({ ...settings, showCollapsedText: false }, playing), false);
  assert.equal(stays(settings, { ...playing, collapsedItem: "agent" }), false);
  assert.equal(stays(settings, { ...playing, songPlaying: false }), false);
});

test("unstarted todos do not hold; Start and a running countdown do", () => {
  const settings = { keepVisibleWhileTodoRunning: true };
  assert.equal(stays(settings, {}), false);
  assert.equal(stays(settings, { activeTodoId: "a" }), true);
  assert.equal(stays(settings, { activeTodoId: "" }), false);
  assert.equal(stays(settings, { timer: { endsAt: 2000 } }), true);
  assert.equal(stays(settings, { timer: { endsAt: 1000 } }), false);
  assert.equal(stays({ ...settings, todoEnabled: false }, { activeTodoId: "a" }), false);
});

test("keep-visible only pauses collapsed idle plan B, never expanded plan A", () => {
  assert.equal(idlePlan("collapsed", DEFAULT_SETTINGS, false, false, true), null);
  assert.deepEqual(idlePlan("expanded", DEFAULT_SETTINGS, false, false, true), { seconds: 30, action: "collapse" });
  assert.deepEqual(idlePlan("collapsed", DEFAULT_SETTINGS, false, false, false), { seconds: 30, action: "tuck" });
});
