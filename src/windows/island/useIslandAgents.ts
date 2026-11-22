import { useMemo } from "react";
import type { AgentQuotaSource, IslandSettings } from "../../features/appearance/types";
import { useAgentStatus } from "../../features/agent-status/useAgentStatus";
import { useAgentSession } from "../../features/agent-status/useAgentSession";
import { useIslandAgentSessions } from "../../features/agent-status/useIslandAgentSessions";
import { useAgentUsages } from "../../features/agent-status/useAgentUsages";
import { filterQuotaUsages } from "../../features/agent-status/usage";
import { useWorkbuddyUsage } from "../../features/agent-status/useWorkbuddyUsage";
import { useNativeAgents } from "../../features/agent-status/nativeAgents";

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

  // Plugin-market agents are offered like the others once installed and switched on.
  const native = useNativeAgents(settings);
  const shown = settings.agentShowUsage ? settings.agentQuotaSources : NO_QUOTA_RINGS;
  const watchesQuota = settings.agentQuotaAlertPercent > 0;
  const alertSources = {
    claudeCode: watchesQuota && settings.agentShowClaudeCode,
    codex: watchesQuota && settings.agentShowCodex,
    dsh: watchesQuota && settings.agentShowDsh,
    workbuddy: watchesQuota && settings.agentShowWorkbuddy,
    kimiCode: watchesQuota && native.kimiCode,
    zcode: watchesQuota && native.zcode,
    antigravity: watchesQuota && native.antigravity,
  };
  // Read once for both rings and alerts. Either setting can need the data independently.
  const usages = useAgentUsages(settings.agentStatusEnabled, {
    claudeCode: shown.includes("claudeCode") || alertSources.claudeCode,
    codex: shown.includes("codex") || alertSources.codex,
    dsh: shown.includes("dsh") || alertSources.dsh,
    kimiCode: native.kimiCode && (shown.includes("kimiCode") || alertSources.kimiCode),
    zcode: native.zcode && (shown.includes("zcode") || alertSources.zcode),
    antigravity: native.antigravity && (shown.includes("antigravity") || alertSources.antigravity),
  });
  const { state: workbuddy } = useWorkbuddyUsage(settings.agentStatusEnabled && (shown.includes("workbuddy") || alertSources.workbuddy));
  const workbuddyUsage = workbuddy.status === "connected" ? workbuddy.usage : null;
  const agentUsages = useMemo(() => filterQuotaUsages({
    ...usages,
    workbuddy: workbuddyUsage,
  }, shown), [usages, workbuddyUsage, shown]);
  const { claudeCode, codex, dsh, workbuddy: watchesWorkbuddy, kimiCode, zcode, antigravity } = alertSources;
  const alertUsages = useMemo(() => ({
    claude: claudeCode ? usages.claude : null,
    codex: codex ? usages.codex : null,
    dsh: dsh ? usages.dsh : null,
    workbuddy: watchesWorkbuddy ? workbuddyUsage : null,
    kimi: kimiCode ? usages.kimi : null,
    zcode: zcode ? usages.zcode : null,
    antigravity: antigravity ? usages.antigravity : null,
    readAt: usages.readAt,
  }), [usages.claude, usages.codex, usages.dsh, usages.kimi, usages.zcode, usages.antigravity, usages.readAt, claudeCode, codex, dsh, kimiCode, zcode, antigravity, workbuddyUsage, watchesWorkbuddy]);

  return { agentStatus, ...sessions, agentSession, agentUsages, alertUsages };
}
