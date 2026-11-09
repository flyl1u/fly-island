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
import { shownEffort } from "../../src/features/agent-status/effortLabels.ts";

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
  assert.equal(getAgentPageExpandedHeight(3), 316);
  // Each extra session adds one full row and its gap.
  assert.equal(getAgentPageExpandedHeight(4) - getAgentPageExpandedHeight(3), 80);
  // The tallest choice still fits the native window (656px).
  assert.ok(getAgentPageExpandedHeight(MAX_AGENT_VISIBLE_ROWS) <= 656);
  // Cards (62px, 6px apart) and compact rows (34px, 4px apart) size the page by their own rows.
  assert.equal(getAgentPageExpandedHeight(4, 0, "cards") - getAgentPageExpandedHeight(3, 0, "cards"), 68);
  assert.equal(getAgentPageExpandedHeight(4, 0, "compact") - getAgentPageExpandedHeight(3, 0, "compact"), 38);
  assert.equal(getAgentPageExpandedHeight(1, 0, "cards"), getAgentPageExpandedHeight(0, 0, "cards") + 62 + 6 - 6 + 6);
  // Flat rows stay the default view; an unknown saved one falls back to it.
  assert.equal(DEFAULT_SETTINGS.agentSessionView, "list");
  assert.equal(normalizeSettings({ agentSessionView: "cards" }).agentSessionView, "cards");
  assert.equal(normalizeSettings({ agentSessionView: "tiles" }).agentSessionView, "list");
  assert.equal(DEFAULT_SETTINGS.agentSessionSort, "status");
  assert.equal(normalizeSettings({ agentSessionSort: "firstSeen" }).agentSessionSort, "firstSeen");
  assert.equal(normalizeSettings({ agentSessionGroup: "project" }).agentSessionGroup, "project");
  assert.equal(normalizeSettings({ agentSessionGroup: "tree" }).agentSessionGroup, "computer");
  // Archiving slides out unless the dust is chosen.
  assert.equal(DEFAULT_SETTINGS.agentArchiveMotion, "slide");
  assert.equal(normalizeSettings({ agentArchiveMotion: "dissolve" }).agentArchiveMotion, "dissolve");
  assert.equal(normalizeSettings({ agentArchiveMotion: "explode" }).agentArchiveMotion, "slide");
  // Card light effects are off unless chosen.
  assert.equal(DEFAULT_SETTINGS.agentCardEffects, "off");
  assert.equal(normalizeSettings({ agentCardEffects: "sparkle" }).agentCardEffects, "sparkle");
  assert.equal(normalizeSettings({ agentCardEffects: "rainbow" }).agentCardEffects, "off");

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
  // Sessions that have quit are hidden unless turned off; the window stays 2 hours.
  assert.equal(DEFAULT_SETTINGS.agentHideClosed, true);
  assert.equal(normalizeSettings({}).agentHideClosed, true);
  assert.equal(normalizeSettings({ agentHideClosed: false }).agentHideClosed, false);
  assert.equal(DEFAULT_SETTINGS.agentSessionHours, 2);
});

test("plugins rename an agent's effort for display only", () => {
  const labels = { claudeCode: { medium: "xhigh", high: "max" } };
  assert.equal(shownEffort("claudeCode", "medium", labels), "xhigh");
  assert.equal(shownEffort("claudeCode", "High", labels), "max");
  assert.equal(shownEffort("claudeCode", "low", labels), "low");
  assert.equal(shownEffort("codex", "medium", labels), "medium");
  assert.equal(shownEffort("claudeCode", null, labels), null);
  assert.equal(modelLabel("Opus 5.5", shownEffort("claudeCode", "medium", labels)), "Opus 5.5 · Xhigh");
});

test("sessions arrange by light or time, under computer, project or no headings", async () => {
  const { arrangeSessions } = await import("../../src/features/agent-status/sessionList.ts");
  const s = (id, updatedAt, phase = "completed", extra = {}) => ({ provider: "claudeCode", sessionId: id, phase, updatedAt, cwd: null, ...extra });
  const ids = (groups) => groups.map((group) => [group.host, group.project, group.sessions.map((session) => session.sessionId)]);
  const sessions = [
    s("done", 50),
    s("asks", 10, "completed", { replyAsks: true }),
    s("waits", 20, "waiting", { remoteHost: "zcm6", cwd: "/home/u/fly-island" }),
    s("runs", 40, "running", { cwd: "E:/fly-island-lanes/3" }),
    s("old", 30, "running", { remoteHost: "nc-e" }),
  ];
  assert.deepEqual(ids(arrangeSessions(sessions, "status", "computer")), [
    [null, null, ["asks", "runs", "done"]],
    ["zcm6", null, ["waits"]],
    ["nc-e", null, ["old"]],
  ]);
  assert.deepEqual(ids(arrangeSessions(sessions, "recent", "none")), [[null, null, ["done", "runs", "old", "waits", "asks"]]]);
  assert.deepEqual(ids(arrangeSessions(sessions, "status", "project")), [
    ["zcm6", "fly-island", ["waits"]],
    [null, null, ["asks", "done"]],
    [null, "fly-island", ["runs"]],
    ["nc-e", null, ["old"]],
  ]);
  assert.deepEqual(ids(arrangeSessions([s("x", 1, "running", { remoteHost: "zcm6" })], "status", "computer")), [["zcm6", null, ["x"]]]);
  assert.deepEqual(arrangeSessions([], "status", "computer"), []);
  // First seen keeps the order a session had when the island first listed it, however it writes after.
  const first = [s("a", 100), s("b", 200)];
  assert.deepEqual(ids(arrangeSessions(first, "firstSeen", "none"))[0][2], ["b", "a"]);
  assert.deepEqual(ids(arrangeSessions([s("a", 900), s("b", 200), s("c", 300)], "firstSeen", "none"))[0][2], ["c", "b", "a"]);
});
