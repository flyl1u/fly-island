import { readJson, writeJson } from "../../../lib/storage.ts";

export const AGENT_APPROVAL_STORAGE_KEY = "focusd-island-agent-approval";

export type AgentApprovalSettings = {
  /** Agents' permission requests wait for a card on the island instead of the terminal prompt. */
  onIsland: boolean;
  /**
   * Also while the session's own terminal or editor is in front. Off (the default), such a request
   * goes straight back to the terminal prompt, which the user is looking at anyway.
   */
  whenInFront: boolean;
};

/** Off until the user turns it on: while a request waits, the terminal shows no prompt of its own. */
export const DEFAULT_AGENT_APPROVAL_SETTINGS: AgentApprovalSettings = { onIsland: false, whenInFront: false };

export function normalizeAgentApprovalSettings(value: unknown): AgentApprovalSettings {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  // whenInFront is no longer a setting: it stays at its default (off) whatever was saved.
  return { onIsland: saved.onIsland === true, whenInFront: DEFAULT_AGENT_APPROVAL_SETTINGS.whenInFront };
}

export function loadAgentApprovalSettings(): AgentApprovalSettings {
  return normalizeAgentApprovalSettings(readJson(AGENT_APPROVAL_STORAGE_KEY));
}

export function saveAgentApprovalSettings(settings: AgentApprovalSettings) {
  writeJson(AGENT_APPROVAL_STORAGE_KEY, settings);
}
