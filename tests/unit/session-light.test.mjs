import assert from "node:assert/strict";
import test from "node:test";
import { sessionLight } from "../../src/features/agent-status/sessionLight.ts";

const light = (phase, extra = {}) => sessionLight({ phase, replyMarker: null, replyAsks: false, ...extra });

test("mid-turn phases give red, green and dim green; failed stays its own", () => {
  assert.equal(light("waiting"), "needs");
  assert.equal(light("running"), "working");
  assert.equal(light("stale"), "stale");
  assert.equal(light("failed", { replyAsks: true }), "failed");
  // A marker or a question only matters once the turn is over.
  assert.equal(light("running", { replyMarker: "yourTurn", replyAsks: true }), "working");
});

test("a finished turn: the marker decides, else whether the reply asks", () => {
  assert.equal(light("completed", { replyMarker: "yourTurn" }), "yourTurn");
  assert.equal(light("completed", { replyMarker: "background" }), "working");
  assert.equal(light("completed", { replyMarker: "done", replyAsks: true }), "done");
  assert.equal(light("completed", { replyAsks: true }), "yourTurn");
  assert.equal(light("completed"), "done");
  // A background task the turn started keeps it working, unless the reply asks something.
  assert.equal(light("completed", { backgroundTasks: 1 }), "working");
  assert.equal(light("completed", { backgroundTasks: 1, replyAsks: true }), "yourTurn");
  assert.equal(light("completed", { backgroundTasks: 1, replyMarker: "done" }), "done");
  // Builds before replyAsks existed.
  assert.equal(sessionLight({ phase: "completed" }), "done");
});
