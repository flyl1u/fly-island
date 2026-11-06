import assert from "node:assert/strict";
import test from "node:test";
import { alertKind, detectAlerts, phasesOf } from "../../src/features/agent-status/alerts.ts";

const session = (sessionId, phase) => ({
  provider: "claudeCode", sessionId, cwd: null, title: sessionId, model: null, effort: null,
  phase, lastMessage: null, updatedAt: 0, host: null, turnStartedAt: null,
});
const ALL = { started: "everyTurn", completed: true, failed: true, waiting: true };

test("a turn that ends, fails or asks the user alerts once", () => {
  assert.equal(alertKind("running", "completed"), "completed");
  assert.equal(alertKind("waiting", "completed"), "completed");
  assert.equal(alertKind("stale", "completed"), "completed");
  assert.equal(alertKind("running", "failed"), "failed");
  assert.equal(alertKind("running", "waiting"), "waiting");
  // No change, or a change that needs nothing from the user.
  assert.equal(alertKind("completed", "completed"), null);
  assert.equal(alertKind("waiting", "waiting"), null);
  assert.equal(alertKind("failed", "failed"), null);
  assert.equal(alertKind("running", "stale"), null);
});

test("a session seen for the first time alerts when it is waiting or working", () => {
  assert.equal(alertKind(undefined, "waiting"), "waiting");
  assert.equal(alertKind(undefined, "completed"), null);
  assert.equal(alertKind(undefined, "failed"), null);
  assert.equal(alertKind(undefined, "running"), "started");
});

test("alerts come from the change since the last look, of the kinds switched on", () => {
  const before = [session("a", "running"), session("b", "running"), session("c", "completed")];
  // The first look only takes note.
  assert.deepEqual(detectAlerts(null, before, ALL), []);
  const after = [session("a", "completed"), session("b", "waiting"), session("c", "completed"), session("d", "waiting")];
  const alerts = detectAlerts(phasesOf(before), after, ALL);
  assert.deepEqual(alerts.map(({ kind, session }) => `${kind}:${session.sessionId}`), ["completed:a", "waiting:b", "waiting:d"]);
  const onlyWaiting = detectAlerts(phasesOf(before), after, { ...ALL, completed: false });
  assert.deepEqual(onlyWaiting.map(({ session }) => session.sessionId), ["b", "d"]);
  assert.deepEqual(detectAlerts(phasesOf(after), after, ALL), []);
});

test("a turn starts when a finished session runs again, not when a stalled or answered one does", () => {
  assert.equal(alertKind("completed", "running"), "started");
  assert.equal(alertKind("failed", "running"), "started");
  assert.equal(alertKind("stale", "running"), null);
  assert.equal(alertKind("waiting", "running"), null);
  assert.equal(alertKind("running", "running"), null);
});

test("starts alert every turn, for new sessions only, or never", () => {
  // a was there when the island started; b shows up later and works, then finishes.
  const first = phasesOf([session("a", "completed")]);
  const withB = [session("a", "completed"), session("b", "running")];
  const started = (previous, sessions, mode) =>
    detectAlerts(previous, sessions, { ...ALL, started: mode }).filter(({ kind }) => kind === "started").map(({ session }) => session.sessionId);
  assert.deepEqual(started(first, withB, "everyTurn"), ["b"]);
  assert.deepEqual(started(first, withB, "newSession"), ["b"]);
  assert.deepEqual(started(first, withB, "off"), []);
  const bWorked = phasesOf(withB, first);
  const bDone = phasesOf([session("a", "completed"), session("b", "completed")], bWorked);
  const nextTurns = [session("a", "running"), session("b", "running")];
  assert.deepEqual(started(bDone, nextTurns, "everyTurn"), ["a", "b"]);
  // a was listed at the first look and b has worked since: neither is a new session.
  assert.deepEqual(started(bDone, nextTurns, "newSession"), []);
  const fresh = [session("a", "completed"), session("b", "completed"), session("c", "completed")];
  const cAppears = phasesOf(fresh, bDone);
  // c showed up finished (an empty session after /clear, say); its first turn is still new.
  assert.deepEqual(started(cAppears, [session("a", "completed"), session("b", "completed"), session("c", "running")], "newSession"), ["c"]);
});
