// 与 src-tauri/src/lib.rs 中的 AgentTaskStatus、AgentStatusSnapshot、AgentHooksInstallResult 对应。
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
