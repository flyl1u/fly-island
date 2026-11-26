import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_PEEK_MAX_MS, AGENT_PEEK_MS, advanceAgentPeek, newlyStartedAgent } from "../../src/windows/island/agentPeek.ts";
import { listRunningAgents } from "../../src/features/agent-status/session.ts";
import { nextCollapsedItem, resolveCollapsedItem } from "../../src/windows/island/collapsedItem.ts";

const agent = (key, startedAt = 0) => ({ key, startedAt, session: { provider: "codex", label: "Codex", title: key } });
const summary = (sessionId, phase, extra = {}) => ({
  provider: "claudeCode", sessionId, cwd: null, title: sessionId, phase, updatedAt: 1000, turnStartedAt: 500, ...extra,
});
const keys = (...agents) => new Set(agents.map((entry) => entry.key));
const over = { now: 10_000, allowed: true, overChoice: true };

test("only running sessions count: waiting, finished and closed ones do not", () => {
  const sessions = [summary("a", "running"), summary("b", "waiting"), summary("c", "completed"),
    summary("d", "running", { closed: true }), summary("e", "idle")];
  const others = [{ id: "local-api/x", name: "X", title: "T", phase: "running", updatedAt: 9 },
    { id: "local-api/y", name: "Y", title: "U", phase: "waiting", updatedAt: 9 }];
  assert.deepEqual(listRunningAgents(sessions, others).map((entry) => entry.key), ["claudeCode:a", "other:local-api/x"]);
});

test("an untitled running session is listed, so a later title is not a new task", () => {
  const untitled = listRunningAgents([summary("a", "running", { title: null })], undefined);
  assert.equal(untitled[0].session, null);
  assert.equal(newlyStartedAgent(keys(...untitled), listRunningAgents([summary("a", "running")], undefined)), null);
});

test("only the change to running starts a task, and the newest of several wins", () => {
  const a = agent("a", 1), b = agent("b", 2), c = agent("c", 3);
  assert.equal(newlyStartedAgent(keys(a), [a]), null);
  assert.equal(newlyStartedAgent(keys(a), [a, c, b]), c);
  // Waiting or finished drops it out of the set; running again is a new turn.
  assert.equal(newlyStartedAgent(new Set(), [a]), a);
});

test("a start over a manual choice of something else peeks for 2.5s", () => {
  assert.equal(AGENT_PEEK_MS, 2500);
  const peek = advanceAgentPeek(null, agent("a"), over);
  assert.equal(peek.key, "a");
  assert.equal(peek.endsAt - over.now, AGENT_PEEK_MS);
  assert.equal(advanceAgentPeek(peek, null, { ...over, now: 11_000 }), peek);
  assert.equal(advanceAgentPeek(peek, null, { ...over, now: peek.endsAt }), null);
});

test("without a manual choice of something else nothing peeks", () => {
  assert.equal(advanceAgentPeek(null, agent("a"), { ...over, overChoice: false }), null);
  assert.equal(advanceAgentPeek(null, { key: "a", startedAt: 0, session: null }, over), null);
});

test("more starts restart the clock and show the newest, never longer than 5s in all", () => {
  let peek = advanceAgentPeek(null, agent("a"), over);
  peek = advanceAgentPeek(peek, agent("b"), { ...over, now: 12_000 });
  assert.deepEqual([peek.key, peek.endsAt], ["b", 14_500]);
  peek = advanceAgentPeek(peek, agent("c"), { ...over, now: 14_000 });
  assert.deepEqual([peek.key, peek.endsAt], ["c", over.now + AGENT_PEEK_MAX_MS]);
});

test("opening, tucking or a message ends the peek and the start is not replayed", () => {
  const peek = advanceAgentPeek(null, agent("a"), over);
  assert.equal(advanceAgentPeek(peek, null, { ...over, allowed: false }), null);
  assert.equal(advanceAgentPeek(null, agent("b"), { ...over, allowed: false }), null);
  assert.equal(advanceAgentPeek(null, null, over), null);
});

test("a choice that disappears leaves the running peek, which then falls back to priority", () => {
  const peek = advanceAgentPeek(null, agent("a"), over);
  assert.equal(advanceAgentPeek(peek, null, { ...over, now: 10_500, overChoice: false }), peek);
  const order = ["todo", "agent", "lyrics"];
  const has = { agent: true, todo: true, lyrics: false };
  assert.deepEqual(resolveCollapsedItem(order, has, has, "lyrics", true, false), { choice: null, item: "todo" });
});

test("the wheel during a peek rotates from the user's own choice", () => {
  // The choice is todo while the agent peeks over it: up from todo is lyrics.
  assert.equal(nextCollapsedItem(["agent", "lyrics", "todo"], { agent: true, todo: true, lyrics: true }, "todo", -1), "lyrics");
});
