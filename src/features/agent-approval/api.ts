import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import type { AgentProvider } from "../agent-status/api";

// Mirror the event names in src-tauri/src/agent_approval/mod.rs.
export const AGENT_APPROVAL_REQUESTED_EVENT = "agent-approval-requested";
export const AGENT_APPROVAL_CLOSED_EVENT = "agent-approval-closed";

/** A tool call an agent waits on the island's approval for; one per session is shown at a time. */
export type AgentApprovalRequest = {
  id: number;
  agent: AgentProvider;
  sessionId: string;
  cwd: string | null;
  toolName: string;
  /** The tool's input as the agent sent it (for Bash, `{ command, description? }`). */
  toolInput: unknown;
  /** Claude Code's suggested "always allow" rules; passed back for `allowAlways`. */
  permissionSuggestions: unknown[] | null;
  /** Unix milliseconds. */
  receivedAt: number;
};

/**
 * Why a card went away: decided on the island, waited past the limit (back to the terminal),
 * the agent hung up (Esc in the terminal), handed back to the terminal, or the island quit.
 */
export type AgentApprovalCloseReason = "decided" | "timeout" | "disconnected" | "handedBack" | "shutdown";

export type AgentApprovalClosed = { id: number; reason: AgentApprovalCloseReason };

/** `allowAlways` keeps the suggested rules for this session only (Claude Code); `terminal` hands it back. */
export type AgentApprovalDecision = "allow" | "deny" | "allowAlways" | "terminal";

/** On, the endpoint holds hook requests for the island; off, it hands them straight back. */
export function setAgentApprovalEnabled(enabled: boolean) {
  return invoke<void>("set_agent_approval_enabled", { enabled });
}

/** `message` goes to the agent with a denial. */
export function decideAgentApproval(id: number, decision: AgentApprovalDecision, message?: string) {
  return invoke<void>("agent_approval_decide", { id, decision, message: message ?? null });
}

/** The requests shown now, for a window that loads while they wait. */
export function getPendingAgentApprovals() {
  return invoke<AgentApprovalRequest[]>("agent_approval_pending");
}

export function listenAgentApprovalRequested(callback: EventCallback<AgentApprovalRequest>): Promise<UnlistenFn> {
  return listen(AGENT_APPROVAL_REQUESTED_EVENT, callback);
}

export function listenAgentApprovalClosed(callback: EventCallback<AgentApprovalClosed>): Promise<UnlistenFn> {
  return listen(AGENT_APPROVAL_CLOSED_EVENT, callback);
}
