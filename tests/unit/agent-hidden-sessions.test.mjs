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

test("a removed session stays hidden until it writes to its file again", () => {
  const hidden = hideSession({}, session("a", 1000));
  assert.equal(isHidden(session("a", 1000), hidden), true);
  assert.equal(isHidden(session("a", 1000, "codex"), hidden), false);
  assert.equal(isHidden(session("b", 1000), hidden), false);
  assert.equal(isHidden(session("a", 1500), hidden), false);
  assert.deepEqual(forgetReturned(hidden, [session("a", 1500)]), {});
  // Nothing came back: the same object, so nothing is saved again.
  assert.equal(forgetReturned(hidden, [session("a", 1000), session("b", 9000)]), hidden);
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
