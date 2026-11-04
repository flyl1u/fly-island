import type { Translations } from "../../i18n";
import type { AgentProvider, AgentStatusSnapshot, AgentTaskPhase, AgentTaskStatus } from "./api";

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
};
export const AGENT_PROVIDERS: AgentProvider[] = ["codex", "claudeCode"];
export const AGENT_PROVIDER_LABELS: Record<AgentProvider, string> = {
  codex: "Codex",
  claudeCode: "Claude Code",
};
export function isAgentAttentionPhase(phase: AgentTaskPhase) {
  return phase === "failed" || phase === "stale";
}

export function getAgentVisualState(snapshot: AgentStatusSnapshot): AgentVisualState {
  const statuses = AGENT_PROVIDERS.map((provider) => snapshot[provider]);

  if (statuses.some((status) => isAgentAttentionPhase(status.phase))) {
    return "attention";
  }

  if (statuses.some((status) => status.phase === "running")) {
    return "running";
  }

  return "idle";
}

export function getAgentStatusLabel(snapshot: AgentStatusSnapshot, t: Translations) {
  const attentionProvider = AGENT_PROVIDERS.find((provider) =>
    isAgentAttentionPhase(snapshot[provider].phase),
  );

  if (attentionProvider) {
    const phase = snapshot[attentionProvider].phase;
    const providerLabel = AGENT_PROVIDER_LABELS[attentionProvider];
    return phase === "stale"
      ? t.agent.stale(providerLabel)
      : t.agent.failed(providerLabel);
  }

  const runningProvider = AGENT_PROVIDERS.find(
    (provider) => snapshot[provider].phase === "running",
  );

  if (runningProvider) {
    return t.agent.running(AGENT_PROVIDER_LABELS[runningProvider]);
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
    case "idle":
    default:
      return t.agent.phase.idle;
  }
}
