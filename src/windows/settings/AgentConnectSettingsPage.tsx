import { AgentHooksSettingsSection } from "../../features/agent-status/AgentHooksSettingsSection";
import { AgentReplyMarkerSettings } from "../../features/agent-status/AgentReplyMarkerSettings";
import { useAgentStatusSettings } from "../../features/agent-status/useAgentStatusSettings";
import { WorkbuddyConnectionSettings } from "../../features/agent-status/WorkbuddyConnectionSettings";

/**
 * Settings → AI Agent → Connection: installing and repairing the Claude Code and Codex hooks, each
 * agent's state, and right below them the reply status marker, the other thing that tells the island
 * what a session waits on (recommended).
 */
export function AgentConnectSettingsPage({ pollWorkbuddy }: { pollWorkbuddy: boolean }) {
  // Owned by the page so agent status is only polled while it is open.
  const agentStatus = useAgentStatusSettings();
  return (
    <>
      <AgentHooksSettingsSection {...agentStatus} />
      <AgentReplyMarkerSettings />
      <WorkbuddyConnectionSettings polling={pollWorkbuddy} />
    </>
  );
}
