import { AgentHooksSettingsSection } from "../../features/agent-status/AgentHooksSettingsSection";
import { useAgentStatusSettings } from "../../features/agent-status/useAgentStatusSettings";

/** Settings → AI Agent → Connection: installing and repairing the Claude Code and Codex hooks, and each agent's state. */
export function AgentConnectSettingsPage() {
  // Owned by the page so agent status is only polled while it is open.
  const agentStatus = useAgentStatusSettings();
  return <AgentHooksSettingsSection {...agentStatus} />;
}
