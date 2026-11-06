import type { AgentSessionSummary, ExternalAgentStatus } from "./api";

/**
 * A report from another computer: it names the machine (`host`) and the agent (`agent`), sent by
 * a plugin or over the local API, often through an SSH tunnel (docs/agent-status-hooks.md,
 * "Sessions on Other Computers"). The Agent page lists these with the local sessions.
 */
export function isRemoteSessionReport(report: ExternalAgentStatus) {
  return Boolean(report.host) && (report.agent === "claudeCode" || report.agent === "codex");
}

/** Remote reports as Agent page rows; idle ones are left out. */
export function remoteSessions(others: ExternalAgentStatus[] | undefined): AgentSessionSummary[] {
  return (others ?? []).flatMap((report) => {
    if (!isRemoteSessionReport(report) || report.phase === "idle" || !report.agent || !report.host) return [];
    return [{
      provider: report.agent,
      sessionId: report.id,
      cwd: report.cwd ?? null,
      title: report.title ?? null,
      model: null,
      effort: null,
      phase: report.phase,
      lastMessage: null,
      updatedAt: report.updatedAt,
      host: { name: report.host, exe: null, kind: "remote" },
      turnStartedAt: null,
      remoteHost: report.host,
    }];
  });
}

/** Local and remote sessions in the list's order: working ones first, then the newest. */
export function withRemoteSessions(local: AgentSessionSummary[], remote: AgentSessionSummary[]) {
  if (remote.length === 0) return local;
  const active = (session: AgentSessionSummary) => session.phase === "running" || session.phase === "waiting";
  return [...local, ...remote].sort((a, b) => Number(active(b)) - Number(active(a)) || b.updatedAt - a.updatedAt);
}
