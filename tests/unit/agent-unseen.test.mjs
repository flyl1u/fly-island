import assert from "node:assert/strict";
import test from "node:test";
import { asksUser, isUnseen, markSeen, sessionKey } from "../../src/features/agent-status/unseen.ts";

const session = (phase, updatedAt, turnStartedAt = updatedAt - 100) => ({
  provider: "claudeCode", sessionId: "s1", phase, updatedAt, turnStartedAt,
});

test("finished turns stay unseen until marked, and the next turn is unseen again", () => {
  const turns = { since: 1000, seen: {} };
  assert.equal(isUnseen(session("completed", 2000), turns), true);
  assert.equal(isUnseen(session("failed", 2000), turns), true);
  assert.equal(isUnseen(session("running", 2000), turns), false);
  // Finished before the island started.
  assert.equal(isUnseen(session("completed", 900), turns), false);

  const seen = markSeen(turns, [session("completed", 2000)]);
  assert.equal(seen.seen[sessionKey(session("completed", 2000))], 1900);
  assert.equal(isUnseen(session("completed", 2000), seen), false);
  // A later write to the same turn (a title, a summary) keeps it seen.
  assert.equal(isUnseen(session("completed", 2500, 1900), seen), false);
  assert.equal(isUnseen(session("completed", 4000, 3000), seen), true);
  assert.equal(markSeen(seen, [session("completed", 2500, 1900)]), seen);
});

test("a turn with no known prompt is told apart by its last write", () => {
  const turns = markSeen({ since: 0, seen: {} }, [session("completed", 2000, null)]);
  assert.equal(isUnseen(session("completed", 2000, null), turns), false);
  assert.equal(isUnseen(session("completed", 3000, null), turns), true);
});

test("sessions waiting on the user stay unseen until looked at, and a second wait is unseen again", () => {
  const turns = { since: 5000, seen: {} };
  // Waiting, or a finished turn that asked, still asks even if it began before the island started.
  assert.equal(isUnseen(session("waiting", 2000), turns), true);
  assert.equal(isUnseen({ ...session("completed", 2000), replyAsks: true }, turns), true);
  assert.equal(isUnseen(session("failed", 2000), turns), true);
  assert.equal(asksUser(session("waiting", 2000)), true);
  assert.equal(asksUser(session("completed", 2000)), false);
  const seen = markSeen(turns, [session("waiting", 2000)]);
  assert.equal(isUnseen(session("waiting", 2000), seen), false);
  // Answered, then stuck again later in the same turn: unseen again.
  assert.equal(isUnseen(session("waiting", 2600, 1900), seen), true);
  // Answered, and the turn ended asking: a new state, unseen again.
  assert.equal(isUnseen({ ...session("completed", 3000, 1900), replyAsks: true }, seen), true);
});
