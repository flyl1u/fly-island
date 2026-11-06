import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AgentProvider } from "../api";

// Mirrors the agent hook endpoint in src-tauri (roadmap B6 2.1): a permission request an agent's
// PermissionRequest hook is holding open until the island answers or hands it back.
export const APPROVAL_REQUESTED_EVENT = "agent-approval-requested";
export const APPROVAL_CLOSED_EVENT = "agent-approval-closed";

export type AgentApprovalRequest = {
  id: string;
  provider: AgentProvider;
  sessionId: string;
  cwd: string | null;
  /** "Bash", "Edit", "WebFetch"; an MCP tool by its own name. */
  toolName: string;
  /** The tool's input as the agent sent it (`tool_input`). */
  toolInput: unknown;
  /** Rules Claude Code offers for "always allow" (`permission_suggestions`); Codex has none. */
  permissionSuggestions?: unknown[];
  /** Unix ms. */
  receivedAt: number;
};

/** Why a request left the queue; only "decided" is the island's own doing. */
export type AgentApprovalCloseReason = "decided" | "timeout" | "disconnected" | "handedBack" | "shutdown";

export type AgentApprovalClosed = { id: string; reason: AgentApprovalCloseReason };

/** "terminal" hands the request back: the agent shows its own prompt in the terminal. */
export type AgentApprovalDecision = "allow" | "deny" | "allowAlways" | "terminal";

export function listenAgentApprovalRequests(onRequest: (request: AgentApprovalRequest) => void) {
  return listen<AgentApprovalRequest>(APPROVAL_REQUESTED_EVENT, (event) => onRequest(event.payload));
}

export function listenAgentApprovalsClosed(onClosed: (closed: AgentApprovalClosed) => void) {
  return listen<AgentApprovalClosed>(APPROVAL_CLOSED_EVENT, (event) => onClosed(event.payload));
}

export function decideAgentApproval(id: string, decision: AgentApprovalDecision, message?: string) {
  return invoke<void>("agent_approval_decide", { id, decision, message });
}

/** The requests still waiting, oldest first; for a window that (re)loads while some are open. */
export function getPendingAgentApprovals() {
  return invoke<AgentApprovalRequest[]>("agent_approval_pending");
}
