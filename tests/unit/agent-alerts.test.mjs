import assert from "node:assert/strict";
import test from "node:test";
import { alertKind, detectAlerts, phasesOf } from "../../src/features/agent-status/alerts.ts";

const session = (sessionId, phase) => ({
  provider: "claudeCode", sessionId, cwd: null, title: sessionId, model: null, effort: null,
  phase, lastMessage: null, updatedAt: 0, host: null, turnStartedAt: null,
});
const ALL = { completed: true, failed: true, waiting: true };

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
  assert.equal(alertKind("completed", "running"), null);
  assert.equal(alertKind("running", "stale"), null);
});

test("a session seen for the first time only alerts when it is waiting", () => {
  assert.equal(alertKind(undefined, "waiting"), "waiting");
  assert.equal(alertKind(undefined, "completed"), null);
  assert.equal(alertKind(undefined, "failed"), null);
  assert.equal(alertKind(undefined, "running"), null);
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
