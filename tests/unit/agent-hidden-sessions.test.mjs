import assert from "node:assert/strict";
import test from "node:test";
import {
  forgetReturned,
  hideSession,
  isHidden,
  MAX_HIDDEN,
  normalizeHiddenSessions,
  unhideSession,
} from "../../src/features/agent-status/hiddenSessions.ts";

const session = (sessionId, updatedAt, provider = "claudeCode") => ({ provider, sessionId, updatedAt });

test("a removed session with no known turn stays hidden until its file changes", () => {
  const hidden = hideSession({}, session("a", 1000));
  assert.equal(isHidden(session("a", 1000), hidden), true);
  assert.equal(isHidden(session("a", 1000, "codex"), hidden), false);
  assert.equal(isHidden(session("b", 1000), hidden), false);
  assert.equal(isHidden(session("a", 1500), hidden), false);
  assert.deepEqual(forgetReturned(hidden, [session("a", 1500)]), {});
  // Nothing came back: the same object, so nothing is saved again.
  assert.equal(forgetReturned(hidden, [session("a", 1000), session("b", 9000)]), hidden);
});

test("a removed session with a known turn comes back only when a new turn starts", () => {
  const asking = { provider: "claudeCode", sessionId: "q", updatedAt: 5000, turnStartedAt: 4000 };
  const hidden = hideSession({}, asking);
  assert.equal(hidden["claudeCode:q"], 4000);
  // An idle summary written later in the same turn keeps it hidden.
  assert.equal(isHidden({ ...asking, updatedAt: 9000 }, hidden), true);
  assert.equal(forgetReturned(hidden, [{ ...asking, updatedAt: 9000 }]), hidden);
  // A new prompt is a new turn.
  assert.equal(isHidden({ ...asking, updatedAt: 9500, turnStartedAt: 9400 }, hidden), false);
  // An entry saved before (the last write) still hides the same turn.
  assert.equal(isHidden({ ...asking, updatedAt: 9000 }, { "claudeCode:q": 5000 }), true);
});

test("looked-at turns are kept across restarts, newest first when trimmed", async () => {
  const { markSeen, normalizeSeen, MAX_SEEN } = await import("../../src/features/agent-status/unseen.ts");
  assert.deepEqual(normalizeSeen({ "claudeCode:a": 5, "codex:b": "x" }), { "claudeCode:a": 5 });
  assert.deepEqual(normalizeSeen(null), {});
  let turns = { since: 0, seen: {} };
  for (let index = 0; index < MAX_SEEN + 2; index += 1) {
    turns = markSeen(turns, [{ provider: "claudeCode", sessionId: String(index), phase: "completed", updatedAt: 10, turnStartedAt: 5 }]);
  }
  assert.equal(Object.keys(turns.seen).length, MAX_SEEN);
  assert.equal("claudeCode:0" in turns.seen, false);
  assert.equal(`claudeCode:${MAX_SEEN + 1}` in turns.seen, true);
});

test("undo puts a session back, and the list keeps only the newest removals", () => {
  const hidden = hideSession(hideSession({}, session("a", 1)), session("b", 2));
  assert.deepEqual(unhideSession(hidden, "claudeCode:a"), { "claudeCode:b": 2 });
  assert.equal(unhideSession(hidden, "claudeCode:x"), hidden);
  let many = {};
  for (let index = 0; index < MAX_HIDDEN + 5; index += 1) many = hideSession(many, session(String(index), index));
  assert.equal(Object.keys(many).length, MAX_HIDDEN);
  assert.equal("claudeCode:0" in many, false);
  assert.equal(`claudeCode:${MAX_HIDDEN + 4}` in many, true);
});

test("stored removals are read back with anything malformed dropped", () => {
  assert.deepEqual(normalizeHiddenSessions({ "claudeCode:a": 5, "codex:b": "x", "codex:c": Infinity }), { "claudeCode:a": 5 });
  assert.deepEqual(normalizeHiddenSessions([1, 2]), {});
  assert.deepEqual(normalizeHiddenSessions(null), {});
});
