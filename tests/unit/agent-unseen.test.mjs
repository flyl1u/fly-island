import assert from "node:assert/strict";
import test from "node:test";
import { isUnseen, markSeen, sessionKey } from "../../src/features/agent-status/unseen.ts";

const session = (phase, updatedAt, turnStartedAt = updatedAt - 100) => ({
  provider: "claudeCode", sessionId: "s1", phase, updatedAt, turnStartedAt,
});

test("finished turns stay unseen until marked, and the next turn is unseen again", () => {
  const turns = { since: 1000, seen: {} };
  assert.equal(isUnseen(session("completed", 2000), turns), true);
  assert.equal(isUnseen(session("failed", 2000), turns), true);
  assert.equal(isUnseen(session("running", 2000), turns), false);
  assert.equal(isUnseen(session("waiting", 2000), turns), false);
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
