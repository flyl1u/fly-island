import { useMemo } from "react";
import type { AgentQuotaSource, IslandSettings } from "../../features/appearance/types";
import { useAgentStatus } from "../../features/agent-status/useAgentStatus";
import { useAgentSession } from "../../features/agent-status/useAgentSession";
import { useIslandAgentSessions } from "../../features/agent-status/useIslandAgentSessions";
import { useAgentUsages } from "../../features/agent-status/useAgentUsages";
import { filterQuotaUsages } from "../../features/agent-status/usage";
import { useWorkbuddyUsage } from "../../features/agent-status/useWorkbuddyUsage";

const NO_QUOTA_RINGS: readonly AgentQuotaSource[] = [];

/**
 * The agent status, the island's agent sessions, the one the collapsed island names, and Claude's
 * and Codex's usage limits for the Agent page.
 */
export function useIslandAgents(settings: IslandSettings) {
  const agentStatus = useAgentStatus(settings.agentStatusEnabled);
  const sessions = useIslandAgentSessions(settings);
  const others = agentStatus.others;
  const agentSession = useAgentSession(
    sessions.agentSessions,
    others,
    settings.agentStatusEnabled && settings.agentTitleEnabled,
  );

  const shown = settings.agentShowUsage ? settings.agentQuotaSources : NO_QUOTA_RINGS;
  const watchesQuota = settings.agentQuotaAlertPercent > 0;
  const alertSources = {
    claudeCode: watchesQuota && settings.agentShowClaudeCode,
    codex: watchesQuota && settings.agentShowCodex,
    dsh: watchesQuota && settings.agentShowDsh,
  };
  // Read once for both rings and alerts. Either setting can need the data independently.
  const usages = useAgentUsages(settings.agentStatusEnabled, {
    claudeCode: shown.includes("claudeCode") || alertSources.claudeCode,
    codex: shown.includes("codex") || alertSources.codex,
    dsh: shown.includes("dsh") || alertSources.dsh,
  });
  const { state: workbuddy } = useWorkbuddyUsage(settings.agentStatusEnabled && shown.includes("workbuddy"));
  const agentUsages = useMemo(() => filterQuotaUsages({
    ...usages,
    workbuddy: workbuddy.status === "connected" ? workbuddy.usage : null,
  }, shown), [usages, workbuddy, shown]);
  const { claudeCode, codex, dsh } = alertSources;
  const alertUsages = useMemo(() => ({
    claude: claudeCode ? usages.claude : null,
    codex: codex ? usages.codex : null,
    dsh: dsh ? usages.dsh : null,
    readAt: usages.readAt,
  }), [usages.claude, usages.codex, usages.dsh, usages.readAt, claudeCode, codex, dsh]);

  return { agentStatus, ...sessions, agentSession, agentUsages, alertUsages };
}
