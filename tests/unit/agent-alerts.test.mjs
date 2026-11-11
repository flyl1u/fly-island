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

test("the reply status marker decides how a finished turn alerts", () => {
  assert.equal(alertKind("running", "completed", "yourTurn"), "waiting");
  assert.equal(alertKind("running", "completed", "background"), null);
  assert.equal(alertKind("running", "completed", "done"), "completed");
  // The marker only speaks for a turn that just finished.
  assert.equal(alertKind("completed", "completed", "yourTurn"), null);
  assert.equal(alertKind("running", "failed", "yourTurn"), "failed");

  const before = [session("a", "running"), session("b", "running"), session("c", "running")];
  const after = [
    { ...session("a", "completed"), replyMarker: "yourTurn" },
    { ...session("b", "completed"), replyMarker: "background" },
    { ...session("c", "completed"), replyMarker: "done" },
  ];
  const alerts = detectAlerts(phasesOf(before), after, ALL);
  assert.deepEqual(alerts.map(({ kind, session }) => `${kind}:${session.sessionId}`), ["waiting:a", "completed:c"]);
  // "Your turn" follows the waiting switch, not the completed one.
  const noWaiting = detectAlerts(phasesOf(before), after, { ...ALL, waiting: false });
  assert.deepEqual(noWaiting.map(({ session }) => session.sessionId), ["c"]);
});

test("without a marker, a finished reply that ends in a question mark alerts as completed", () => {
  const before = [session("a", "running"), session("b", "running"), session("c", "running")];
  const after = [
    { ...session("a", "completed"), replyAsks: true },
    { ...session("b", "completed"), replyAsks: false },
    // The marker wins over the guess.
    { ...session("c", "completed"), replyAsks: true, replyMarker: "done" },
  ];
  const alerts = detectAlerts(phasesOf(before), after, ALL);
  // "要不要我顺便…？" is an offer; only the marker (or a question tool) asks for an answer.
  assert.deepEqual(alerts.map(({ kind, session }) => `${kind}:${session.sessionId}`), ["completed:a", "completed:b", "completed:c"]);
});

test("reminders: once per wait, after the delay, for sessions still waiting on the user", async () => {
  const { isWaitingOnUser, takeDueReminders } = await import("../../src/features/agent-status/alerts.ts");
  const { reminderSound } = await import("../../src/features/agent-status/sounds/events.ts");
  assert.equal(isWaitingOnUser(session("a", "waiting")), true);
  assert.equal(isWaitingOnUser({ ...session("a", "completed"), replyMarker: "yourTurn" }), true);
  assert.equal(isWaitingOnUser({ ...session("a", "completed"), replyMarker: "done" }), false);
  assert.equal(isWaitingOnUser(session("a", "running")), false);

  const state = { since: new Map(), reminded: new Set() };
  const ids = (due) => due.map((one) => one.sessionId);
  assert.deepEqual(ids(takeDueReminders(state, [session("w", "waiting"), session("r", "running")], 1000, 60_000)), []);
  assert.deepEqual(ids(takeDueReminders(state, [session("w", "waiting")], 60_999, 60_000)), []);
  assert.deepEqual(ids(takeDueReminders(state, [session("w", "waiting")], 61_000, 60_000)), ["w"]);
  assert.deepEqual(ids(takeDueReminders(state, [session("w", "waiting")], 500_000, 60_000)), [], "once per wait");
  // Answered, then waiting again: a new wait with its own reminder.
  takeDueReminders(state, [session("w", "running")], 500_000, 60_000);
  assert.equal(state.since.size, 0);
  assert.deepEqual(ids(takeDueReminders(state, [session("w", "waiting")], 600_000, 60_000)), []);
  assert.deepEqual(ids(takeDueReminders(state, [session("w", "waiting")], 660_000, 60_000)), ["w"]);
  // A session the user already looked at is not reminded about (roadmap B15).
  const fresh = { since: new Map(), reminded: new Set() };
  const looked = (one) => one.sessionId === "w";
  takeDueReminders(fresh, [session("w", "waiting"), session("v", "waiting")], 0, 60_000, looked);
  assert.deepEqual(ids(takeDueReminders(fresh, [session("w", "waiting"), session("v", "waiting")], 61_000, 60_000, looked)), ["v"]);

  assert.equal(reminderSound({ ...session("a", "waiting"), currentTool: { name: "AskUserQuestion", detail: null } }), "question");
  assert.equal(reminderSound({ ...session("a", "completed"), replyMarker: "yourTurn" }), "question");
  assert.equal(reminderSound({ ...session("a", "waiting"), currentTool: { name: "Bash", detail: "ls" } }), "approval");
});

test("by default only finished tasks, waits and questions pop up, and no reminder follows", async () => {
  const { DEFAULT_SETTINGS } = await import("../../src/features/appearance/settingsDefaults.ts");
  assert.equal(DEFAULT_SETTINGS.agentAlertStarted, "off");
  assert.equal(DEFAULT_SETTINGS.agentRemindSeconds, 0);
  assert.equal(DEFAULT_SETTINGS.agentAlertCompleted && DEFAULT_SETTINGS.agentAlertWaiting, true);
});
