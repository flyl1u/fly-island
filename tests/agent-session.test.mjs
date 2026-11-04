import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPLETED_TITLE_HOLD_MS,
  agentSessionExpiresAt,
  pickAgentSession,
} from "../src/features/agent-status/session.ts";

const NOW = 1_800_000_000_000;

function snapshot(codex = {}, claudeCode = {}) {
  return {
    codex: { phase: "idle", updatedAt: 0, ...codex },
    claudeCode: { phase: "idle", updatedAt: 0, ...claudeCode },
    updatedAt: NOW,
    statusPath: "",
  };
}

test("a running session with a title is picked", () => {
  assert.deepEqual(
    pickAgentSession(snapshot({}, { phase: "running", updatedAt: NOW - 10, title: "设置界面完善思路" }), NOW),
    { provider: "claudeCode", label: "Claude Code", title: "设置界面完善思路" },
  );
});

test("sessions without a title, or idle, are not shown", () => {
  assert.equal(pickAgentSession(snapshot({ phase: "running", updatedAt: NOW }), NOW), null);
  assert.equal(pickAgentSession(snapshot({ phase: "running", updatedAt: NOW, title: "  " }), NOW), null);
  assert.equal(pickAgentSession(snapshot({ phase: "idle", updatedAt: NOW, title: "x" }), NOW), null);
});

test("failed and stale sessions keep their title", () => {
  assert.equal(pickAgentSession(snapshot({ phase: "failed", updatedAt: 1, title: "a" }), NOW)?.title, "a");
  assert.equal(pickAgentSession(snapshot({ phase: "stale", updatedAt: 1, title: "b" }), NOW)?.title, "b");
});

test("a completed title is held briefly, then dropped", () => {
  const done = snapshot({ phase: "completed", updatedAt: NOW - 1000, title: "恢复发布机环境" });
  assert.equal(pickAgentSession(done, NOW)?.provider, "codex");
  assert.equal(agentSessionExpiresAt(done, NOW), NOW - 1000 + COMPLETED_TITLE_HOLD_MS);
  const later = NOW - 1000 + COMPLETED_TITLE_HOLD_MS;
  assert.equal(pickAgentSession(done, later), null);
  assert.equal(agentSessionExpiresAt(done, later), null);
});

test("with several sessions the most recently updated wins", () => {
  const both = snapshot(
    { phase: "running", updatedAt: NOW - 500, title: "codex task" },
    { phase: "running", updatedAt: NOW - 100, title: "claude task" },
  );
  assert.equal(pickAgentSession(both, NOW)?.provider, "claudeCode");
  const codexNewer = snapshot(
    { phase: "completed", updatedAt: NOW - 50, title: "codex task" },
    { phase: "running", updatedAt: NOW - 100, title: "claude task" },
  );
  assert.equal(pickAgentSession(codexNewer, NOW)?.provider, "codex");
});

test("sources reported by plugins or the local API are named by their own name", () => {
  const reported = {
    ...snapshot(),
    others: [{ id: "local-api/aider", name: "Aider", phase: "running", title: "Refactor parser", updatedAt: NOW - 10 }],
  };
  assert.deepEqual(pickAgentSession(reported, NOW), { provider: null, label: "Aider", title: "Refactor parser" });
});
