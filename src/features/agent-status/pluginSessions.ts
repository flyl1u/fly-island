import type { AgentSessionSummary } from "./api";
import type { PluginsSnapshot } from "../plugins";

/** Namespaced ids keep archives, unseen markers and clicks independent of built-in sessions. */
export function pluginSessions(snapshot: PluginsSnapshot, hours: number, now: number): AgentSessionSummary[] {
  return Object.entries(snapshot.live).flatMap(([id, live]) => {
    if (live.status !== "running" || !snapshot.registry.installed[id]?.enabled) return [];
    return live.sessions.filter((s) => now - s.updatedAt <= hours * 3600000).map((s) => ({
      provider: "plugin", sessionId: `${id}/${s.id}`, pluginId: id, pluginAction: s.action,
      cwd: s.cwd, title: s.title, phase: s.status, updatedAt: s.updatedAt,
      model: null, effort: null, lastMessage: null, turnStartedAt: null,
      host: { name: snapshot.registry.installed[id].manifest.name.en, kind: "app", exe: null },
    }));
  });
}
