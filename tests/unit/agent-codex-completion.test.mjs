import assert from "node:assert/strict";
import test from "node:test";
import { detectAlerts, phasesOf } from "../../src/features/agent-status/alerts.ts";
import { hasNewCompletion, RECENT_COMPLETION_MS } from "../../src/features/agent-status/completion.ts";
import { soundFor } from "../../src/features/agent-status/sounds/events.ts";
import { emptyAnnounced, settledFinishes } from "../../src/features/agent-status/announce.ts";
import { sameAgentSessions } from "../../src/features/agent-status/sessionList.ts";
import { DEFAULT_AGENT_STATUS, getAgentVisualState } from "../../src/features/agent-status/status.ts";

const NOW = 1_800_000_000_000;
const ALL = { started: "off", completed: true, failed: true, waiting: true };
const session = (lastCompletedAt = NOW - 1000, overrides = {}) => ({
  provider: "codex", sessionId: "thinking", phase: "completed", title: "A reasoning question",
  cwd: null, host: null, model: null, effort: null, lastMessage: "42", updatedAt: NOW,
  turnStartedAt: NOW - 3000, ownerPromptAt: NOW - 3000, lastCompletedAt,
  ...overrides,
});

test("a complete turn between polls is announced once even with the same phase and answer", () => {
  const before = session(NOW - 5000, { turnStartedAt: NOW - 8000, ownerPromptAt: NOW - 8000 });
  const after = session();
  const previous = phasesOf([before]);
  assert.deepEqual(detectAlerts(previous, [after], ALL, NOW).map((a) => a.kind), ["completed"]);
  assert.equal(soundFor("completed", "completed", after, before.lastCompletedAt, NOW), "complete");
  const seen = phasesOf([after], previous);
  assert.deepEqual(detectAlerts(seen, [after], ALL, NOW), []);
  assert.equal(soundFor("completed", "completed", after, after.lastCompletedAt, NOW), null);
  // A changed turn end cannot be swallowed by the minute-resolution mtime comparison.
  assert.equal(sameAgentSessions([before], [{ ...before, lastCompletedAt: after.lastCompletedAt }]), false);
});

test("first sighting accepts only an explicit completion within fifteen seconds", () => {
  for (const age of [0, 1000, RECENT_COMPLETION_MS]) {
    const fresh = session(NOW - age);
    assert.equal(hasNewCompletion(undefined, fresh, NOW), true);
    assert.deepEqual(detectAlerts(null, [fresh], ALL, NOW).map((a) => a.kind), ["completed"]);
    assert.equal(soundFor(undefined, "completed", fresh, undefined, NOW), "complete");
  }
  for (const ended of [undefined, null, 0, NaN, Infinity, NOW + 1, NOW - RECENT_COMPLETION_MS - 1]) {
    const old = session(ended, { lastCompletedAt: ended });
    assert.equal(hasNewCompletion(undefined, old, NOW), false);
    assert.deepEqual(detectAlerts(null, [old], ALL, NOW), []);
    assert.equal(soundFor(undefined, "completed", old, undefined, NOW), null);
  }
  const history = Array.from({ length: 12 }, (_, i) => session(NOW - 60_000 * (i + 1), { sessionId: String(i) }));
  assert.deepEqual(detectAlerts(null, history, ALL, NOW), []);
  assert.deepEqual(detectAlerts(phasesOf([]), history, ALL, NOW), []);
});

test("a recent session that appears after startup also announces, historical metadata does not", () => {
  const fresh = session();
  assert.equal(detectAlerts(phasesOf([]), [fresh], ALL, NOW).length, 1);
  const old = session(NOW - 60_000);
  const metadata = { ...old, updatedAt: NOW, lastMessage: "changed title metadata" };
  assert.equal(detectAlerts(phasesOf([old]), [metadata], ALL, NOW).length, 0);
  assert.equal(soundFor("completed", "completed", metadata, old.lastCompletedAt, NOW), null);
  // A temporarily absent row must not announce the same recent completion again.
  const remembered = phasesOf([], phasesOf([fresh]));
  assert.equal(detectAlerts(remembered, [fresh], ALL, NOW).length, 0);
});

test("background suppression, your-turn markers and alert switches still apply", () => {
  for (const previous of [null, phasesOf([session(NOW - 10_000)])]) {
    const background = session(undefined, { replyMarker: "background" });
    assert.deepEqual(detectAlerts(previous, [background], ALL, NOW), []);
    const work = session(undefined, { backgroundTasks: 1 });
    assert.deepEqual(detectAlerts(previous, [work], ALL, NOW), []);
    const question = session(undefined, { replyMarker: "yourTurn" });
    assert.deepEqual(detectAlerts(previous, [question], ALL, NOW).map((a) => a.kind), ["waiting"]);
  }
  const done = session();
  assert.deepEqual(detectAlerts(null, [done], { ...ALL, completed: false }, NOW), []);
  assert.equal(soundFor(undefined, "completed", { ...done, replyMarker: "background" }, undefined, NOW), null);
  assert.equal(soundFor(undefined, "completed", { ...done, backgroundTasks: 1 }, undefined, NOW), null);
  assert.equal(soundFor(undefined, "completed", { ...done, replyMarker: "yourTurn" }, undefined, NOW), "question");
  assert.equal(hasNewCompletion(undefined, { ...done, phase: "running" }, NOW), false);
});

test("settling keeps six seconds, once per prompt, and cancels superseded/background finishes", () => {
  const done = session();
  const announced = emptyAnnounced();
  assert.deepEqual(settledFinishes([done], [{ ...done, phase: "running" }], announced), []);
  assert.deepEqual(settledFinishes([done], [{ ...done, backgroundTasks: 1 }], announced), []);
  const newer = session(NOW, { ownerPromptAt: NOW - 500, turnStartedAt: NOW - 500 });
  assert.deepEqual(settledFinishes([done], [newer], announced), []);
  assert.deepEqual(settledFinishes([newer], [newer], announced), [newer]);
  assert.deepEqual(settledFinishes([newer], [newer], announced), []);
});

test("rollout running count lights the collapsed island even with no hook status", () => {
  assert.equal(getAgentVisualState(DEFAULT_AGENT_STATUS, 1), "running");
  assert.equal(getAgentVisualState(DEFAULT_AGENT_STATUS, 0), "idle");
});
