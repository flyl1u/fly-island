import { invoke } from "@tauri-apps/api/core";

// 与 src-tauri/src/agent_status/snapshot.rs 中的 AgentTaskStatus、AgentStatusSnapshot，以及 agent_status/mod.rs 中的 AgentHooksInstallResult 对应。
export type AgentProvider = "codex" | "claudeCode";
export type AgentTaskPhase = "idle" | "running" | "completed" | "failed" | "stale";

export type AgentTaskStatus = {
  phase: AgentTaskPhase;
  taskId?: string;
  updatedAt: number;
};

export type AgentStatusSnapshot = Record<AgentProvider, AgentTaskStatus> & {
  updatedAt: number;
  statusPath: string;
};

export type AgentHooksInstallResult = {
  scriptsDir: string;
  statusPath: string;
  codexConfigPath: string;
  claudeConfigPath: string;
  installedAt: number;
};

export function getAgentStatus() {
  return invoke<AgentStatusSnapshot>("get_agent_status");
}

export function clearAgentProviderStatus(provider: AgentProvider) {
  return invoke<AgentStatusSnapshot>("clear_agent_status", { provider });
}

export function installAgentStatusHooks() {
  return invoke<AgentHooksInstallResult>("install_agent_status_hooks");
}
