import { invoke } from "@tauri-apps/api/core";

// 与 src-tauri/src/agent_status/snapshot.rs 中的 AgentTaskStatus、AgentStatusSnapshot，以及 agent_status/mod.rs 中的 AgentHooksInstallResult 对应。
export type AgentProvider = "codex" | "claudeCode";
/** `waiting` (asked the user mid-turn) only comes from the session list, for Claude Code. */
export type AgentTaskPhase = "idle" | "running" | "waiting" | "completed" | "failed" | "stale";

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

/** Mirrors AgentSessionSummary in src-tauri/src/agent_status/sessions.rs. */
export type AgentSessionSummary = {
  provider: AgentProvider;
  sessionId: string;
  cwd: string | null;
  title: string | null;
  /** "Opus 5.5" for Claude models, the raw name otherwise. */
  model: string | null;
  effort: string | null;
  phase: Exclude<AgentTaskPhase, "idle">;
  lastMessage: string | null;
  updatedAt: number;
  /** The program the session runs in, when known. */
  host: SessionHost | null;
  /** When the newest prompt was sent (Unix ms): the current or last turn runs from here. */
  turnStartedAt: number | null;
  /** That newest prompt, shortened like a title. Missing from builds before it was sent. */
  lastPrompt?: string | null;
  /** The tool the current turn called last; null once the turn is over. */
  currentTool?: AgentToolCall | null;
  /** How freely the session may act; null when not known. Missing from older builds. */
  permissionMode?: AgentPermissionMode | null;
  /** Subagents the current turn started that are still running (Claude Code only). */
  subagents?: number;
};

/** Mirrors session_mode.rs: Claude Code's permission mode, or Codex's approval and sandbox policy. */
export type AgentPermissionMode = "default" | "auto" | "bypass" | "acceptEdits" | "plan";

/** Mirrors ToolCall in src-tauri/src/agent_status/tool_call.rs. */
export type AgentToolCall = {
  /** "Bash", "Edit"; an MCP tool by its own name. */
  name: string;
  /** The command, file name or pattern, when the tool has an obvious one. */
  detail: string | null;
};

/** Mirrors SessionHost in src-tauri/src/agent_status/session_host.rs. */
export type SessionHost = {
  /** Product name, such as "Windows Terminal"; not translated. */
  name: string;
  /** Its executable, for the icon; null when unknown. */
  exe: string | null;
  /** The fallback icon when there is no executable icon. */
  kind: "terminal" | "editor" | "app";
};

/** The icon of a session host's executable as a PNG data URL; null when it has none. */
export function getAgentHostIcon(path: string) {
  return invoke<string | null>("get_agent_host_icon", { path });
}

/** Claude Code and Codex sessions active in the last two hours, running ones first. */
export function listAgentSessions(windowHours?: number) {
  return invoke<AgentSessionSummary[]>("list_agent_sessions", { windowHours });
}

/**
 * Brings the editor or terminal window of a session to the front (in Orca, its terminal tab too);
 * false when none matched. The session id finds a running session's own window.
 */
export function focusAgentWindow(provider: AgentProvider, cwd: string | null, title: string | null, sessionId: string) {
  return invoke<boolean>("focus_agent_window", { provider, cwd, title, sessionId });
}

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
