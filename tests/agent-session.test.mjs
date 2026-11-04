import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPLETED_TITLE_HOLD_MS,
  agentSessionExpiresAt,
  pickAgentSession,
} from "../src/features/agent-status/session.ts";

const NOW = 1_800_000_000_000;

/** One entry of the Agent page's list (list_agent_sessions). */
function session(overrides = {}) {
  return {
    provider: "claudeCode",
    sessionId: "s1",
    cwd: "E:\\Projects\\fly-island",
    title: "设置界面完善思路",
    model: "Opus 5.5",
    effort: "medium",
    phase: "running",
    lastMessage: null,
    updatedAt: NOW - 10,
    ...overrides,
  };
}

test("a running session from the session list is picked", () => {
  assert.deepEqual(pickAgentSession([session()], undefined, NOW), {
    provider: "claudeCode",
    label: "Claude Code",
    title: "设置界面完善思路",
  });
});

test("a session without a title is named by its project folder", () => {
  assert.equal(pickAgentSession([session({ title: null })], undefined, NOW)?.title, "fly-island");
  assert.equal(pickAgentSession([session({ title: "  ", cwd: null })], undefined, NOW), null);
});

test("a session waiting for the user keeps its title", () => {
  assert.equal(pickAgentSession([session({ phase: "waiting", updatedAt: 1, title: "跑测试" })], undefined, NOW)?.title, "跑测试");
});

test("failed and stale sessions keep their title", () => {
  assert.equal(pickAgentSession([session({ phase: "failed", updatedAt: 1, title: "a" })], undefined, NOW)?.title, "a");
  assert.equal(pickAgentSession([session({ phase: "stale", updatedAt: 1, title: "b" })], undefined, NOW)?.title, "b");
});

test("a completed title is held briefly, then dropped", () => {
  const done = [session({ provider: "codex", phase: "completed", updatedAt: NOW - 1000, title: "恢复发布机环境" })];
  assert.equal(pickAgentSession(done, undefined, NOW)?.provider, "codex");
  assert.equal(agentSessionExpiresAt(done, undefined, NOW), NOW - 1000 + COMPLETED_TITLE_HOLD_MS);
  const later = NOW - 1000 + COMPLETED_TITLE_HOLD_MS;
  assert.equal(pickAgentSession(done, undefined, later), null);
  assert.equal(agentSessionExpiresAt(done, undefined, later), null);
});

test("with several sessions the most recently updated wins", () => {
  const both = [
    session({ provider: "codex", sessionId: "c", updatedAt: NOW - 500, title: "codex task" }),
    session({ sessionId: "a", updatedAt: NOW - 100, title: "claude task" }),
  ];
  assert.equal(pickAgentSession(both, undefined, NOW)?.title, "claude task");
  const codexNewer = [
    session({ provider: "codex", sessionId: "c", phase: "completed", updatedAt: NOW - 50, title: "codex task" }),
    session({ sessionId: "a", updatedAt: NOW - 100, title: "claude task" }),
  ];
  assert.equal(pickAgentSession(codexNewer, undefined, NOW)?.provider, "codex");
});

test("sources reported by plugins or the local API are named by their own name", () => {
  const others = [{ id: "local-api/aider", name: "Aider", phase: "running", title: "Refactor parser", updatedAt: NOW - 10 }];
  assert.deepEqual(pickAgentSession([], others, NOW), { provider: null, label: "Aider", title: "Refactor parser" });
  // An untitled or idle report is not shown.
  assert.equal(pickAgentSession([], [{ ...others[0], title: undefined }], NOW), null);
  assert.equal(pickAgentSession([], [{ ...others[0], phase: "idle" }], NOW), null);
  // A newer list session wins over an older report.
  assert.equal(pickAgentSession([session({ updatedAt: NOW })], others, NOW)?.provider, "claudeCode");
});
