import assert from "node:assert/strict";
import test from "node:test";
import { emptyQuotaState, takeQuotaAlerts } from "../../src/features/agent-status/quotaAlerts.ts";
import { compactStarted, emptyIdleSessions, takeIdleSessions } from "../../src/features/agent-status/sounds/idle.ts";

const NOW = 1_000_000_000;
const usage = (fiveHour, sevenDay = null) => ({
  updatedAt: NOW,
  fiveHour: fiveHour === null ? null : { name: "", used: fiveHour, resetsAt: null },
  sevenDay: sevenDay === null ? null : { name: "", used: sevenDay, resetsAt: null },
  models: [],
  plan: null,
});
const read = (claude, codex = null) => ({ claude, codex, readAt: NOW });
const kinds = (alerts) => alerts.map((alert) => `${alert.kind}:${alert.agent}:${alert.window}`);

test("usage alerts once on reaching the level, and once when it resets", () => {
  const state = emptyQuotaState();
  assert.deepEqual(takeQuotaAlerts(state, read(usage(40)), 80, NOW), []);
  assert.deepEqual(kinds(takeQuotaAlerts(state, read(usage(82)), 80, NOW)), ["low:claude:fiveHour"]);
  assert.deepEqual(takeQuotaAlerts(state, read(usage(90)), 80, NOW), [], "no second alert while it stays high");
  assert.deepEqual(takeQuotaAlerts(state, read(usage(70)), 80, NOW), [], "a rolling window easing off is no reset");
  assert.deepEqual(takeQuotaAlerts(state, read(usage(85)), 80, NOW), [], "and climbing back is no new alert");
  assert.deepEqual(kinds(takeQuotaAlerts(state, read(usage(3)), 80, NOW)), ["reset:claude:fiveHour"]);
  assert.deepEqual(kinds(takeQuotaAlerts(state, read(usage(81)), 80, NOW)), ["low:claude:fiveHour"]);
});

test("usage already high when the island starts is noted silently, but its reset still alerts", () => {
  const state = emptyQuotaState();
  assert.deepEqual(takeQuotaAlerts(state, read(usage(95), usage(null, 88)), 80, NOW), []);
  assert.deepEqual(kinds(takeQuotaAlerts(state, read(usage(2), usage(null, 88)), 80, NOW)), ["reset:claude:fiveHour"]);
});

test("off, stale or missing usage changes nothing; Codex counts too", () => {
  const state = emptyQuotaState();
  takeQuotaAlerts(state, read(usage(10), usage(10, 10)), 80, NOW);
  assert.deepEqual(takeQuotaAlerts(state, read(usage(99)), 0, NOW), []);
  const stale = { ...usage(99), updatedAt: NOW - 60 * 60_000 };
  assert.deepEqual(takeQuotaAlerts(state, read(stale), 80, NOW), []);
  assert.deepEqual(takeQuotaAlerts(state, read(null), 80, NOW), []);
  assert.deepEqual(kinds(takeQuotaAlerts(state, read(null, usage(10, 91)), 80, NOW)), ["low:codex:sevenDay"]);
});

const session = (sessionId, phase, updatedAt = 1) => ({ provider: "claudeCode", sessionId, phase, updatedAt });

test("the idle sound comes once per turn for a finished session left unread", () => {
  const state = emptyIdleSessions();
  const unseen = new Set(["claudeCode:a"]);
  const sessions = [session("a", "completed"), session("b", "completed")];
  assert.deepEqual(takeIdleSessions(state, sessions, unseen, 0, 1000), []);
  assert.deepEqual(takeIdleSessions(state, sessions, unseen, 999, 1000), []);
  assert.deepEqual(takeIdleSessions(state, sessions, unseen, 1000, 1000).map((item) => item.sessionId), ["a"]);
  assert.deepEqual(takeIdleSessions(state, sessions, unseen, 5000, 1000), [], "once per turn");
  // Read: it starts over; a new unread turn waits its own time.
  assert.deepEqual(takeIdleSessions(state, sessions, new Set(), 6000, 1000), []);
  const next = [session("a", "completed", 2)];
  assert.deepEqual(takeIdleSessions(state, next, unseen, 7000, 1000), []);
  assert.deepEqual(takeIdleSessions(state, next, unseen, 8000, 1000).length, 1);
  assert.deepEqual(takeIdleSessions(state, [session("a", "running", 3)], unseen, 9000, 1000), [], "working sessions are not idle");
});

test("compacting sounds when it starts, not on the first look", () => {
  assert.equal(compactStarted(false, { compacting: true }), true);
  assert.equal(compactStarted(undefined, { compacting: true }), false);
  assert.equal(compactStarted(true, { compacting: true }), false);
  assert.equal(compactStarted(false, {}), false);
});
