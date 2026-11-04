import type { Translations } from "../../i18n";
import type { AgentHooksState, AgentProvider, AgentStatusSnapshot, AgentTaskPhase, AgentTaskStatus } from "./api";

export type AgentVisualState = "idle" | "running" | "attention";
export type AgentHooksInstallState = "idle" | "installing" | "installed" | "error";

export const DEFAULT_AGENT_TASK_STATUS: AgentTaskStatus = {
  phase: "idle",
  updatedAt: 0,
};
export const DEFAULT_AGENT_STATUS: AgentStatusSnapshot = {
  codex: DEFAULT_AGENT_TASK_STATUS,
  claudeCode: DEFAULT_AGENT_TASK_STATUS,
  updatedAt: 0,
  statusPath: "",
  others: [],
};
export const AGENT_PROVIDERS: AgentProvider[] = ["codex", "claudeCode"];
export const AGENT_PROVIDER_LABELS: Record<AgentProvider, string> = {
  codex: "Codex",
  claudeCode: "Claude Code",
};
/** One row of agent status: a built-in provider or a source reported by a plugin or the local API. */
export type AgentStatusEntry = {
  /** The provider for built-ins, the source id for the others; what clear_agent_status takes. */
  key: string;
  label: string;
  /** Null for reported sources, which have no brand icon. */
  provider: AgentProvider | null;
  status: AgentTaskStatus;
};

export function listAgentStatuses(snapshot: AgentStatusSnapshot): AgentStatusEntry[] {
  return [
    ...AGENT_PROVIDERS.map((provider) => ({
      key: provider,
      label: AGENT_PROVIDER_LABELS[provider],
      provider,
      status: snapshot[provider],
    })),
    ...(snapshot.others ?? []).map((other) => ({ key: other.id, label: other.name, provider: null, status: other })),
  ];
}

export function isAgentAttentionPhase(phase: AgentTaskPhase) {
  return phase === "failed" || phase === "stale";
}

export function getAgentVisualState(snapshot: AgentStatusSnapshot): AgentVisualState {
  const statuses = listAgentStatuses(snapshot).map((entry) => entry.status);

  if (statuses.some((status) => isAgentAttentionPhase(status.phase))) {
    return "attention";
  }

  if (statuses.some((status) => status.phase === "running")) {
    return "running";
  }

  return "idle";
}

/** What the settings page should say about the installed hooks, or null when they are current. */
export type AgentHooksNotice = "update" | "install";

export function getAgentHooksNotice(state: AgentHooksState | null): AgentHooksNotice | null {
  if (!state) return null;
  if (state.scriptsOutdated || AGENT_PROVIDERS.some((provider) => state[provider] === "outdated")) {
    return "update";
  }
  return AGENT_PROVIDERS.every((provider) => state[provider] === "notInstalled") ? "install" : null;
}

export function getAgentStatusLabel(snapshot: AgentStatusSnapshot, t: Translations) {
  const entries = listAgentStatuses(snapshot);
  const attention = entries.find((entry) => isAgentAttentionPhase(entry.status.phase));

  if (attention) {
    return attention.status.phase === "stale"
      ? t.agent.stale(attention.label)
      : t.agent.failed(attention.label);
  }

  const running = entries.find((entry) => entry.status.phase === "running");

  if (running) {
    return t.agent.running(running.label);
  }

  return t.agent.idleOrDone;
}

export function getAgentPhaseLabel(phase: AgentTaskPhase, t: Translations) {
  switch (phase) {
    case "running":
      return t.agent.phase.running;
    case "completed":
      return t.agent.phase.completed;
    case "failed":
      return t.agent.phase.failed;
    case "stale":
      return t.agent.phase.stale;
    case "waiting":
      return t.agent.phase.waiting;
    case "idle":
    default:
      return t.agent.phase.idle;
  }
}
