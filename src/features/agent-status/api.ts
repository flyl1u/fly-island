import { invoke } from "@tauri-apps/api/core";

// 与 src-tauri/src/agent_status/snapshot.rs 中的 AgentTaskStatus、AgentStatusSnapshot，以及 agent_status/mod.rs 中的 AgentHooksInstallResult 对应。
export type AgentProvider = "codex" | "claudeCode";
export type AgentTaskPhase = "idle" | "running" | "completed" | "failed" | "stale";

export type AgentTaskStatus = {
  phase: AgentTaskPhase;
  taskId?: string;
  updatedAt: number;
  /** Session title resolved by the native side; missing for hooks installed before titles existed. */
  title?: string;
};

/** A source reported by a plugin or the local API. Mirrors ExternalAgentStatus in src-tauri/src/agent_status/external.rs. */
export type ExternalAgentStatus = AgentTaskStatus & {
  /** `<owner>/<source>`, e.g. `local-api/aider`. */
  id: string;
  name: string;
};

export type AgentStatusSnapshot = Record<AgentProvider, AgentTaskStatus> & {
  updatedAt: number;
  statusPath: string;
  /** Missing in snapshots from builds before plugins could report agents. */
  others?: ExternalAgentStatus[];
};

export type AgentHooksInstallResult = {
  scriptsDir: string;
  statusPath: string;
  codexConfigPath: string;
  claudeConfigPath: string;
  installedAt: number;
};

/** Mirrors HookInstallState / AgentHooksState in src-tauri/src/agent_status/hooks_state.rs. */
export type HookInstallState = "notInstalled" | "outdated" | "current";

export type AgentHooksState = Record<AgentProvider, HookInstallState> & {
  scriptsOutdated: boolean;
};

export function getAgentHooksState() {
  return invoke<AgentHooksState>("get_agent_hooks_state");
}

export function getAgentStatus() {
  return invoke<AgentStatusSnapshot>("get_agent_status");
}

/** Clears a built-in provider, or an external source by its id. */
export function clearAgentProviderStatus(provider: string) {
  return invoke<AgentStatusSnapshot>("clear_agent_status", { provider });
}

export function installAgentStatusHooks() {
  return invoke<AgentHooksInstallResult>("install_agent_status_hooks");
}
