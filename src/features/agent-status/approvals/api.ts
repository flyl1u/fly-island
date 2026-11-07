import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AgentProvider } from "../api";

// Mirror the event names in src-tauri/src/agent_approval/mod.rs (roadmap B6 2.1): the endpoint
// holds an agent's PermissionRequest hook open until the island answers or hands it back.
export const AGENT_APPROVAL_REQUESTED_EVENT = "agent-approval-requested";
export const AGENT_APPROVAL_CLOSED_EVENT = "agent-approval-closed";

/** A tool call an agent waits on the island's approval for; one per session is sent at a time. */
export type AgentApprovalRequest = {
  id: number;
  /** A tool waiting for permission, or Claude Code's AskUserQuestion waiting for answers. */
  kind: "permission" | "question";
  agent: AgentProvider;
  sessionId: string;
  cwd: string | null;
  /** "Bash", "Edit", "WebFetch"; an MCP tool by its own name. */
  toolName: string;
  /** The tool's input as the agent sent it (for Bash, `{ command, description? }`). */
  toolInput: unknown;
  /** Claude Code's suggested "always allow" rules; passed back for `allowAlways`. Codex has none. */
  permissionSuggestions: unknown[] | null;
  /** Unix milliseconds. */
  receivedAt: number;
  /** The SSH remote computer the session runs on (through the island's reverse forward). */
  remoteHost?: string;
};

/**
 * Why a card went away: decided on the island, waited past the limit (back to the terminal),
 * the agent hung up (Esc in the terminal), handed back to the terminal, or the island quit.
 */
/** answeredElsewhere: the session went on without the island (answered in the terminal). */
export type AgentApprovalCloseReason = "decided" | "timeout" | "disconnected" | "handedBack" | "shutdown" | "answeredElsewhere";

export type AgentApprovalClosed = { id: number; reason: AgentApprovalCloseReason };

/**
 * `allowAlways` keeps the suggested rules for this session only (Claude Code); `terminal` hands it
 * back; `answer` (questions only, with `answers`) answers an AskUserQuestion.
 */
export type AgentApprovalDecision = "allow" | "deny" | "allowAlways" | "terminal" | "answer";

/** Answers to an AskUserQuestion, by question text: an option's label or free text. */
export type AgentQuestionAnswers = Record<string, string>;

/** On, the endpoint holds hook requests for the island; off (the default), it hands them straight back. */
export function setAgentApprovalEnabled(enabled: boolean) {
  return invoke<void>("set_agent_approval_enabled", { enabled });
}

/** `message` goes to the agent with a denial. */
export function decideAgentApproval(id: number, decision: AgentApprovalDecision, message?: string, answers?: AgentQuestionAnswers) {
  return invoke<void>("agent_approval_decide", { id, decision, message: message ?? null, answers: answers ?? null });
}

/** The requests shown now, for a window that loads while they wait. */
export function getPendingAgentApprovals() {
  return invoke<AgentApprovalRequest[]>("agent_approval_pending");
}

export function listenAgentApprovalRequested(onRequest: (request: AgentApprovalRequest) => void): Promise<UnlistenFn> {
  return listen<AgentApprovalRequest>(AGENT_APPROVAL_REQUESTED_EVENT, (event) => onRequest(event.payload));
}

export function listenAgentApprovalClosed(onClosed: (closed: AgentApprovalClosed) => void): Promise<UnlistenFn> {
  return listen<AgentApprovalClosed>(AGENT_APPROVAL_CLOSED_EVENT, (event) => onClosed(event.payload));
}

/** Mirrored by HOTKEY_EVENT in src-tauri/src/agent_status/approval_hotkeys.rs. */
export const APPROVAL_HOTKEY_EVENT = "agent-approval-hotkey";

/** System-wide while a card shows, so they avoid the Ctrl+letter keys other apps use. */
export const APPROVAL_HOTKEYS: { action: AgentApprovalDecision; shortcut: string }[] = [
  { action: "allow", shortcut: "Ctrl+Alt+Y" },
  { action: "deny", shortcut: "Ctrl+Alt+N" },
  { action: "terminal", shortcut: "Ctrl+Alt+T" },
];

/** Registers the card's shortcuts; an empty list releases them. */
export function setAgentApprovalHotkeys(hotkeys: typeof APPROVAL_HOTKEYS) {
  return invoke<void>("set_agent_approval_hotkeys", { hotkeys });
}

export function listenAgentApprovalHotkey(onPress: (action: AgentApprovalDecision) => void) {
  return listen<{ action: AgentApprovalDecision }>(APPROVAL_HOTKEY_EVENT, (event) => onPress(event.payload.action));
}
