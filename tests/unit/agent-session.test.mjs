import assert from "node:assert/strict";
import test from "node:test";
import { pickAgentSession } from "../../src/features/agent-status/session.ts";
import { countActiveSessions, isSessionWaiting } from "../../src/features/agent-status/sessionList.ts";
import { DEFAULT_AGENT_STATUS, getAgentVisualState } from "../../src/features/agent-status/status.ts";

function session(overrides = {}) {
  return {
    provider: "claudeCode",
    sessionId: "s1",
    cwd: "E:\\Projects\\fly-island",
    title: "设置界面完善思路",
    phase: "running",
    updatedAt: 100,
    ...overrides,
  };
}

test("a running session from the session list is picked", () => {
  assert.deepEqual(pickAgentSession([session()]), {
    provider: "claudeCode", label: "Claude Code", title: "设置界面完善思路",
  });
});

test("a session without a title is named by its project folder", () => {
  assert.equal(pickAgentSession([session({ title: null })])?.title, "fly-island");
  assert.equal(pickAgentSession([session({ title: "  ", cwd: null })]), null);
});

test("a session waiting for the user keeps its title", () => {
  const waiting = session({ phase: "waiting", title: "批准执行测试", updatedAt: 120 });
  assert.equal(pickAgentSession([session(), waiting])?.title, waiting.title);
  assert.equal(pickAgentSession([{ ...waiting, closed: true }]), null);
});

test("idle, stale, failed, completed and closed sessions never claim the title", () => {
  for (const phase of ["idle", "stale", "failed", "completed"]) {
    assert.equal(pickAgentSession([session({ phase, closed: false, backgroundTasks: 2 })]), null, phase);
  }
  assert.equal(pickAgentSession([session({ closed: true })]), null);
});

test("a completed turn with background work stays idle while a waiting turn takes the title and light", () => {
  const completed = session({ phase: "completed", backgroundTasks: 2, updatedAt: 140 });
  const waiting = session({ sessionId: "s2", phase: "waiting", title: "确认计划" });
  const snapshot = { ...DEFAULT_AGENT_STATUS, claudeCode: { phase: "completed", updatedAt: 140 } };
  const light = (sessions, status = snapshot) => getAgentVisualState(status, countActiveSessions(sessions), sessions.some(isSessionWaiting));
  assert.equal(pickAgentSession([completed]), null);
  assert.equal(light([completed]), "idle");
  const sessions = [completed, waiting];
  assert.equal(pickAgentSession(sessions)?.title, waiting.title);
  assert.equal(countActiveSessions(sessions), 0);
  assert.equal(light(sessions), "waiting");
  assert.equal(light(sessions, { ...snapshot, claudeCode: { phase: "running", updatedAt: 90 } }), "waiting");
  const withRunning = [...sessions, session({ provider: "codex", sessionId: "s3", updatedAt: 80 })];
  assert.equal(countActiveSessions(withRunning), 1);
  assert.equal(light(withRunning), "waiting");
  assert.equal(light([completed, { ...waiting, closed: true }]), "idle");
});

test("the newest running session wins over both older running sessions and newer finished ones", () => {
  const sessions = [
    session({ provider: "codex", sessionId: "c", updatedAt: 120, title: "codex task" }),
    session({ sessionId: "a", updatedAt: 140, title: "claude task" }),
    session({ sessionId: "b", phase: "completed", updatedAt: 150, title: "done" }),
  ];
  assert.equal(pickAgentSession(sessions)?.title, "claude task");
});

test("running reports from plugins or the local API are named by their own name", () => {
  const report = { id: "local-api/aider", name: "Aider", phase: "running", title: "Refactor parser", updatedAt: 10 };
  assert.deepEqual(pickAgentSession([], [report]), { provider: null, label: "Aider", title: "Refactor parser" });
  const waiting = { ...report, phase: "waiting" };
  assert.equal(pickAgentSession([], [waiting])?.title, report.title);
  assert.equal(getAgentVisualState({ ...DEFAULT_AGENT_STATUS, others: [waiting] }), "waiting");
  assert.equal(pickAgentSession([], [{ ...report, title: undefined }]), null);
  assert.equal(pickAgentSession([], [{ ...report, phase: "idle" }]), null);
  assert.equal(pickAgentSession([], [{ ...report, phase: "completed" }]), null);
  assert.equal(pickAgentSession([session()], [report])?.provider, "claudeCode");
});
