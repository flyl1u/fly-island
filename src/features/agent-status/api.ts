import { invoke } from "@tauri-apps/api/core";
import type { AgentEffortLabels } from "./effortLabels";

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
  /** The machine the agent runs on, for a session on another computer. */
  host?: string;
  /** Which agent it is, when it is Claude Code or Codex. */
  agent?: AgentProvider;
  cwd?: string;
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
  /**
   * What the last reply's marker line says, when the optional reply status marker is on
   * (Settings → AI Agent; Claude Code only). Missing from older builds.
   */
  replyMarker?: ReplyMarker | null;
  /**
   * Whether the last reply ends by asking the user something; tells "your turn" from "done" on a
   * finished turn without a marker (src-tauri/src/agent_status/reply_text.rs). Missing from older builds.
   */
  replyAsks?: boolean;
  /**
   * Background tasks the newest turn started that have not ended (Claude Code only); a finished
   * turn with one running goes on by itself. Missing from older builds.
   */
  backgroundTasks?: number;
  /** Set for a session on another computer (reported, remoteSessions.ts, or read over SSH); it has no window here. */
  remoteHost?: string;
  /** Compacting its context now (Claude Code PreCompact / PostCompact hooks). Missing from older builds. */
  compacting?: boolean;
  /** The agent's own task list while some of it is left (TodoProgress in todo_list.rs). Missing from older builds. */
  todos?: AgentTodoProgress | null;
};

/** Mirrors TodoProgress in src-tauri/src/agent_status/todo_list.rs. */
export type AgentTodoProgress = { done: number; total: number; current: string | null };

/** Mirrors ReplyMarker::name in src-tauri/src/agent_status/reply_marker.rs. */
export type ReplyMarker = "yourTurn" | "background" | "done";

/** Mirrors ReplyMarkerState in src-tauri/src/agent_status/reply_marker.rs. */
export type ReplyMarkerState = {
  /** The island's block is in the user's global CLAUDE.md. */
  installed: boolean;
  /** It is an older wording; switching on again replaces it. */
  outdated: boolean;
  /** That CLAUDE.md. */
  path: string;
};

export function getReplyMarkerState() {
  return invoke<ReplyMarkerState>("get_reply_marker_state");
}

/** Adds the reply status marker instruction to the user's CLAUDE.md, or removes it. */
export function setReplyMarker(enabled: boolean) {
  return invoke<ReplyMarkerState>("set_reply_marker", { enabled });
}

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
  /** The fallback icon when there is no executable icon; "remote" for another computer. */
  kind: "terminal" | "editor" | "app" | "remote";
};

/** The icon of a session host's executable as a PNG data URL; null when it has none. */
export function getAgentHostIcon(path: string) {
  return invoke<string | null>("get_agent_host_icon", { path });
}

/** Claude Code and Codex sessions active in the last two hours, running ones first. */
export function listAgentSessions(windowHours?: number) {
  return invoke<AgentSessionSummary[]>("list_agent_sessions", { windowHours });
}

/** Mirrors RemoteHostStatus in src-tauri/src/agent_status/remote_sessions.rs. */
export type RemoteHostStatus = {
  host: string;
  /** When the last read succeeded, Unix milliseconds. */
  fetchedAt: number | null;
  error: string | null;
  fetching: boolean;
};

/** The Host aliases in ~/.ssh/config. */
export function listSshHosts() {
  return invoke<string[]>("list_ssh_hosts");
}

/** The computers whose sessions are read over SSH, with how the last read went. */
export function getAgentRemoteHosts() {
  return invoke<RemoteHostStatus[]>("get_agent_remote_hosts");
}

export function setAgentRemoteHosts(hosts: string[]) {
  return invoke<string[]>("set_agent_remote_hosts", { hosts });
}

/**
 * Brings the editor or terminal window of a session to the front (in Orca, its terminal tab too);
 * false when none matched. The session id finds a running session's own window.
 */
export function focusAgentWindow(provider: AgentProvider, cwd: string | null, title: string | null, sessionId: string) {
  return invoke<boolean>("focus_agent_window", { provider, cwd, title, sessionId });
}

/** Session ids among `sessions` whose window is in front (agent_sessions_in_front). */
export function agentSessionsInFront(sessions: Pick<AgentSessionSummary, "provider" | "sessionId">[]) {
  return invoke<string[]>("agent_sessions_in_front", {
    sessions: sessions.map(({ provider, sessionId }) => ({ provider, sessionId })),
  });
}

/** Mirrors UsageWindow in src-tauri/src/agent_status/usage.rs. */
export type UsageWindow = {
  /** A per-model window's name ("Fable"); empty for the 5-hour and 7-day windows. */
  name: string;
  /** Percent used, 0 to 100. */
  used: number;
  /** When it resets, Unix ms. */
  resetsAt: number | null;
};

/** Mirrors AgentUsage in src-tauri/src/agent_status/usage.rs. */
export type AgentUsage = {
  updatedAt: number | null;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  models: UsageWindow[];
  plan: string | null;
  /** Where the windows come from. Missing from builds before direct asking. */
  source?: "hud" | "api" | "magpie" | "codex";
  /** Why the last direct request to Anthropic failed; null when it is off or worked. */
  error?: AgentUsageError | null;
};

/** Mirrors UsageErrorKind in src-tauri/src/claude_usage/mod.rs. */
export type AgentUsageErrorKind =
  | "noCredentials"
  | "tokenExpired"
  | "loginRequired"
  | "forbidden"
  | "rateLimited"
  | "noProxy"
  | "network"
  | "http"
  | "invalidResponse";

/** Mirrors UsageError in src-tauri/src/claude_usage/mod.rs. */
export type AgentUsageError = { kind: AgentUsageErrorKind; message: string };

/**
 * Claude usage limits from claude-hud's usage snapshot, or from Anthropic when the usage ring
 * asks it directly; null when there is neither.
 */
export function getAgentUsage() {
  return invoke<AgentUsage | null>("get_agent_usage");
}

/** Codex's usage limits from its rollout files; null when none reports them. */
export function getCodexUsage() {
  return invoke<AgentUsage | null>("get_codex_usage");
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

/** The effort labels of the plugins switched on (contributes.agentEffortLabels, plugin_host/effort_labels.rs). */
export function listAgentEffortLabels() {
  return invoke<AgentEffortLabels>("list_agent_effort_labels");
}
