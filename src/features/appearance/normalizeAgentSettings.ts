// Reading saved settings, part 2 (normalizeSettings in settings.ts): the Agent page and its alerts.
import { DEFAULT_SETTINGS } from "./settingsDefaults.ts";
import { AGENT_QUOTA_SOURCES, AGENT_SESSION_GROUPS, AGENT_SESSION_SORTS, oneOf } from "./settingsLimits.ts";
import type { IslandSettings, LegacyIslandSettings } from "./types";

/** The Agent page's order and headings, and which session events open it. */
export function normalizeAgentSettings(settings: LegacyIslandSettings | null | undefined) {
  const agentShowClaudeCode = settings?.agentShowClaudeCode !== false;
  const agentShowCodex = settings?.agentShowCodex !== false;
  const agentShowDsh = settings?.agentShowDsh !== false;
  const quotaSources = settings?.agentQuotaSources;
  return {
    agentShowClaudeCode,
    agentShowCodex,
    agentShowDsh,
    agentQuotaSources: Array.isArray(quotaSources)
      ? AGENT_QUOTA_SOURCES.filter((source) => quotaSources.includes(source))
      : AGENT_QUOTA_SOURCES.filter((source) => ({ claudeCode: agentShowClaudeCode, codex: agentShowCodex, dsh: agentShowDsh, workbuddy: true })[source]),
    agentSessionSort: oneOf(AGENT_SESSION_SORTS, settings?.agentSessionSort, DEFAULT_SETTINGS.agentSessionSort),
    agentSessionGroup: oneOf(AGENT_SESSION_GROUPS, settings?.agentSessionGroup, DEFAULT_SETTINGS.agentSessionGroup),
    agentAlertCompleted: settings?.agentAlertCompleted !== false,
    agentAlertWaiting: settings?.agentAlertWaiting !== false,
  } satisfies Partial<IslandSettings>;
}
