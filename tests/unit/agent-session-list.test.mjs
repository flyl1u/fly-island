import assert from "node:assert/strict";
import test from "node:test";
import {
  countActiveSessions,
  minutesAgo,
  modelLabel,
  sameAgentSessions,
  sessionProject,
} from "../../src/features/agent-status/sessionList.ts";
import { resolveIslandPage } from "../../src/windows/island/features.ts";

const session = (overrides = {}) => ({
  provider: "claudeCode",
  sessionId: "s1",
  cwd: "E:\\Projects\\fly-island",
  title: "设置界面完善思路",
  model: "Opus 5.5",
  effort: "medium",
  phase: "running",
  lastMessage: "先看一下现有代码。",
  updatedAt: 1_800_000_000_000,
  ...overrides,
});

test("running, waiting and stale sessions count as active", () => {
  const sessions = [
    session(),
    session({ sessionId: "s2", phase: "stale" }),
    session({ sessionId: "s3", phase: "completed" }),
    session({ sessionId: "s4", phase: "failed" }),
    session({ sessionId: "s5", phase: "waiting" }),
  ];
  assert.equal(countActiveSessions(sessions), 3);
  assert.equal(countActiveSessions([]), 0);
});

test("a poll with nothing new shown keeps the same list", () => {
  const list = [session()];
  assert.equal(sameAgentSessions(list, [session({ updatedAt: list[0].updatedAt + 5_000 })]), true);
  assert.equal(sameAgentSessions(list, [session({ phase: "completed" })]), false);
  assert.equal(sameAgentSessions(list, [session({ lastMessage: "做完了" })]), false);
  assert.equal(sameAgentSessions(list, [session({ updatedAt: list[0].updatedAt + 61_000 })]), false);
  assert.equal(sameAgentSessions(list, []), false);
});

test("labels for the session rows", () => {
  assert.equal(sessionProject("E:\\Projects\\fly-island\\"), "fly-island");
  assert.equal(sessionProject("/home/me/repo"), "repo");
  assert.equal(sessionProject(null), null);
  // A worktree shows the project it belongs to, not its own folder.
  assert.equal(sessionProject("E:\\Projects\\fly-island-lanes\\3"), "fly-island");
  assert.equal(sessionProject("E:\\Projects\\fly-island-lane-2"), "fly-island");
  assert.equal(sessionProject("/home/me/repo/.claude/worktrees/fix-tabs"), "repo");
  assert.equal(sessionProject("E:\\Projects\\-lanes\\3"), "3");
  assert.equal(sessionProject("E:\\Projects\\build\\3"), "3");
  assert.equal(modelLabel("Opus 5.5", "medium"), "Opus 5.5 · Medium");
  assert.equal(modelLabel("gpt-6-astra", null), "gpt-6-astra");
  assert.equal(modelLabel(null, null), null);
  assert.equal(minutesAgo(1_000_000, 1_000_000 + 59_000), 0);
  assert.equal(minutesAgo(1_000_000, 1_000_000 + 125_000), 2);
  assert.equal(minutesAgo(2_000_000, 1_000_000), 0);
});

test("the Agent page follows the AI Agent switch", () => {
  const features = { todo: true, music: true, clipboard: true, shelf: true, qq: true, wechat: true, qqMail: true, agents: true };
  assert.equal(resolveIslandPage("agents", features), "agents");
  assert.equal(resolveIslandPage("agents", { ...features, agents: false }), "todo");
  const onlyAgents = { todo: false, music: false, clipboard: false, shelf: false, qq: false, wechat: false, qqMail: false, agents: true };
  assert.equal(resolveIslandPage("todo", onlyAgents), "agents");
});

test("the Agent page fits the session rows set in Settings", async () => {
  const { getAgentPageExpandedHeight } = await import("../../src/windows/island/layout.ts");
  const { normalizeSettings, DEFAULT_SETTINGS, MIN_AGENT_VISIBLE_ROWS, MAX_AGENT_VISIBLE_ROWS } = await import("../../src/features/appearance/settings.ts");
  // Flat rows: three full rows take far less room than the old cards (429px).
  assert.equal(getAgentPageExpandedHeight(3), 296);
  // Each extra session adds one full row and its gap.
  assert.equal(getAgentPageExpandedHeight(4) - getAgentPageExpandedHeight(3), 68);
  // The tallest choice still fits the native window (656px).
  assert.ok(getAgentPageExpandedHeight(MAX_AGENT_VISIBLE_ROWS) <= 656);

  assert.equal(DEFAULT_SETTINGS.agentVisibleRows, 2);
  // Settings saved before this was a setting keep the old three rows.
  assert.equal(normalizeSettings({}).agentVisibleRows, 3);
  assert.equal(normalizeSettings({ agentVisibleRows: 99 }).agentVisibleRows, MAX_AGENT_VISIBLE_ROWS);
  assert.equal(normalizeSettings({ agentVisibleRows: 0 }).agentVisibleRows, MIN_AGENT_VISIBLE_ROWS);
  assert.equal(normalizeSettings({ agentVisibleRows: 3.6 }).agentVisibleRows, 4);
  assert.equal(normalizeSettings({ agentVisibleRows: "4" }).agentVisibleRows, 3);

  // Running time is off unless turned on.
  assert.equal(DEFAULT_SETTINGS.agentShowElapsed, false);
  assert.equal(normalizeSettings({}).agentShowElapsed, false);
  assert.equal(normalizeSettings({ agentShowElapsed: true }).agentShowElapsed, true);
});
