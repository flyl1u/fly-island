import assert from "node:assert/strict";
import test from "node:test";
import {
  DONE_WINDOW_MS,
  SESSION_RING_STATES,
  sessionRingCardLines,
  sessionRingCounts,
  sessionRingSegments,
  sessionRingState,
  sessionRingSummary,
} from "../../src/features/session-ring/ringCounts.ts";
import { en, zhCN } from "../../src/i18n/sections/sessionRing.ts";

const NOW = Date.parse("2026-11-06T08:00:00Z");
const MINUTE = 60_000;

function session(sessionId, phase, overrides = {}) {
  return {
    provider: "claudeCode",
    sessionId,
    cwd: "F:\\code\\fly-island",
    title: `title ${sessionId}`,
    model: null,
    effort: null,
    phase,
    lastMessage: null,
    updatedAt: NOW - MINUTE,
    host: null,
    turnStartedAt: null,
    ...overrides,
  };
}
const NONE = new Set();
const color = (key) => SESSION_RING_STATES.find((state) => state.key === key).color;

test("phases map to ring states; finished ones by whether they were seen and how long ago", () => {
  assert.equal(sessionRingState(session("a", "waiting"), NONE, NOW), "needs");
  assert.equal(sessionRingState(session("a", "running"), NONE, NOW), "working");
  assert.equal(sessionRingState(session("a", "stale"), NONE, NOW), "stale");
  assert.equal(sessionRingState(session("a", "completed"), new Set(["claudeCode:a"]), NOW), "yourturn");
  assert.equal(sessionRingState(session("a", "failed"), new Set(["claudeCode:a"]), NOW), "yourturn");
  assert.equal(sessionRingState(session("a", "completed"), new Set(["codex:a"]), NOW), "done");
  assert.equal(sessionRingState(session("a", "completed", { updatedAt: NOW - DONE_WINDOW_MS }), NONE, NOW), "done");
  assert.equal(sessionRingState(session("a", "completed", { updatedAt: NOW - DONE_WINDOW_MS - 1 }), NONE, NOW), null);
  // An unseen one stays yellow however old it is.
  assert.equal(sessionRingState(session("a", "completed", { updatedAt: NOW - 60 * MINUTE }), new Set(["claudeCode:a"]), NOW), "yourturn");
});

test("counts, segments in ring order and the summary list only states that have sessions", () => {
  const sessions = [
    session("r1", "running"),
    session("w1", "waiting"),
    session("r2", "running"),
    session("old", "completed", { updatedAt: NOW - 60 * MINUTE }),
  ];
  const counts = sessionRingCounts(sessions, NONE, NOW);
  assert.deepEqual(counts, { needs: 1, yourturn: 0, working: 2, stale: 0, done: 0, total: 3 });
  assert.deepEqual(sessionRingSegments(counts), [
    { value: 1, color: color("needs") },
    { value: 2, color: color("working") },
  ]);
  assert.equal(sessionRingSummary(counts, zhCN), "等你确认 1 · 运行 2");
  assert.equal(sessionRingSummary(counts, en), "Needs you 1 · Running 2");
  assert.equal(sessionRingSummary(sessionRingCounts([], NONE, NOW), en), en.empty);
});

test("card names up to three sessions waiting on you, those needing you first", () => {
  const sessions = [
    session("y1", "completed", { title: "写测试" }),
    session("n1", "waiting", { title: "修复登录" }),
    session("y2", "completed", { title: "x".repeat(45), cwd: null }),
    session("n2", "waiting", { title: null, cwd: null }),
    session("y3", "completed"),
  ];
  const unseen = new Set(["claudeCode:y1", "claudeCode:y2", "claudeCode:y3"]);
  const lines = sessionRingCardLines(sessions, unseen, NOW, zhCN);
  assert.deepEqual(lines, [
    "等你确认 2 · 等你回复 3",
    "等你确认：修复登录 · fly-island",
    "等你确认：n2",
    "等你回复：写测试 · fly-island",
  ]);
  const long = sessionRingCardLines([sessions[2]], unseen, NOW, en);
  assert.equal(long[1], `Your turn: ${"x".repeat(40)}…`);
});
