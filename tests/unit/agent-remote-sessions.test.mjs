import assert from "node:assert/strict";
import test from "node:test";
import { isRemoteSessionReport, remoteSessions, withRemoteSessions } from "../../src/features/agent-status/remoteSessions.ts";

const report = (fields) => ({ id: "local-api/r-1", name: "Claude Code", phase: "running", updatedAt: 5000, ...fields });

test("only reports naming a machine and Claude Code or Codex become session rows", () => {
  assert.equal(isRemoteSessionReport(report({ host: "dev-box", agent: "claudeCode" })), true);
  assert.equal(isRemoteSessionReport(report({ host: "dev-box" })), false);
  assert.equal(isRemoteSessionReport(report({ agent: "codex" })), false);
  const [row] = remoteSessions([
    report({ host: "dev-box", agent: "codex", title: "修复登录", cwd: "/srv/app", phase: "waiting" }),
    report({ id: "local-api/aider", name: "Aider" }),
    report({ id: "local-api/r-2", host: "dev-box", agent: "claudeCode", phase: "idle" }),
  ]);
  assert.deepEqual(
    [row.provider, row.sessionId, row.title, row.cwd, row.phase, row.remoteHost, row.host],
    ["codex", "local-api/r-1", "修复登录", "/srv/app", "waiting", "dev-box", { name: "dev-box", exe: null, kind: "remote" }],
  );
  assert.equal(remoteSessions([report({ host: "dev-box", agent: "codex", phase: "idle" })]).length, 0);
  assert.deepEqual(remoteSessions(undefined), []);
});

test("remote rows join the list with working sessions first, then the newest", () => {
  const local = [
    { sessionId: "a", phase: "running", updatedAt: 1000 },
    { sessionId: "b", phase: "completed", updatedAt: 9000 },
  ];
  assert.equal(withRemoteSessions(local, []), local);
  const merged = withRemoteSessions(local, [
    { sessionId: "r1", phase: "waiting", updatedAt: 2000 },
    { sessionId: "r2", phase: "completed", updatedAt: 3000 },
  ]);
  assert.deepEqual(merged.map((session) => session.sessionId), ["r1", "a", "b", "r2"]);
});
