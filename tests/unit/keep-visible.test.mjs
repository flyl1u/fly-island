import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/features/appearance/settings.ts";
import { keepIslandVisible, keepVisibleReason } from "../../src/windows/island/keepVisible.ts";
import { MUSIC_GRACE_MS, musicHolds } from "../../src/windows/island/musicGrace.ts";
import { idlePlan } from "../../src/windows/island/idleCollapse.ts";

const activity = { agentVisualState: "idle", activeAgentSessionCount: 0, collapsedItem: "todo", songPlaying: false, activeTodoId: null, timer: null };
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
  assert.equal(stays({ keepVisibleWhileAgentRunning: true }, { agentVisualState: "waiting", activeAgentSessionCount: 1 }), true);
  for (const state of ["idle", "waiting", "completed", "failed"]) {
    assert.equal(stays({ keepVisibleWhileAgentRunning: true }, { agentVisualState: state }), false);
  }
});

test("playing music holds the island whatever the collapsed text shows", () => {
  const settings = { keepVisibleWhileLyrics: true };
  const playing = { collapsedItem: "lyrics", songPlaying: true };
  assert.equal(stays(settings, playing), true);
  assert.equal(stays({ ...settings, showCollapsedText: false }, playing), true);
  assert.equal(stays(settings, { ...playing, collapsedItem: "agent" }), true);
  assert.equal(stays(settings, { ...playing, collapsedItem: null }), true);
  assert.equal(stays(settings, { ...playing, songPlaying: false }), false);
  assert.equal(stays({}, playing), false);
});

test("a pause or track change shorter than the grace still holds, a longer one does not", () => {
  assert.equal(musicHolds(true, null, 0), true);
  assert.equal(musicHolds(false, null, 10_000), false);
  assert.equal(musicHolds(false, 1000, 1000 + MUSIC_GRACE_MS - 1), true);
  assert.equal(musicHolds(false, 1000, 1000 + MUSIC_GRACE_MS), false);
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

test("diagnostic reasons use stable priority without exposing content", () => {
  const settings = { ...DEFAULT_SETTINGS, keepVisibleWhileAgentRunning: true, keepVisibleWhileLyrics: true, keepVisibleWhileTodoRunning: true };
  const lyric = { ...activity, collapsedItem: "lyrics", songPlaying: true, activeTodoId: "private-id" };
  assert.equal(keepVisibleReason(settings, { ...lyric, agentVisualState: "running" }, 1000), "keep_visible_agent");
  assert.equal(keepVisibleReason(settings, lyric, 1000), "keep_visible_music");
  assert.equal(keepVisibleReason(settings, { ...lyric, songPlaying: false }, 1000), "keep_visible_todo");
});
