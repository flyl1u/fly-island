import { readJson, writeJson } from "../../../lib/storage.ts";

export const AGENT_APPROVAL_STORAGE_KEY = "focusd-island-agent-approval";

export type AgentApprovalSettings = {
  /** Agents' permission requests wait for a card on the island instead of the terminal prompt. */
  onIsland: boolean;
};

/** Off until the user turns it on: while a request waits, the terminal shows no prompt of its own. */
export const DEFAULT_AGENT_APPROVAL_SETTINGS: AgentApprovalSettings = { onIsland: false };

export function normalizeAgentApprovalSettings(value: unknown): AgentApprovalSettings {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return { onIsland: saved.onIsland === true };
}

export function loadAgentApprovalSettings(): AgentApprovalSettings {
  return normalizeAgentApprovalSettings(readJson(AGENT_APPROVAL_STORAGE_KEY));
}

export function saveAgentApprovalSettings(settings: AgentApprovalSettings) {
  writeJson(AGENT_APPROVAL_STORAGE_KEY, settings);
}
