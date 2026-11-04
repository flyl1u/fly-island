import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../../utils/error";
import { clearAgentProviderStatus, getAgentStatus, installAgentStatusHooks, type AgentHooksInstallResult, type AgentProvider, type AgentStatusSnapshot } from "./api";
import { AGENT_PROVIDERS, DEFAULT_AGENT_STATUS, type AgentHooksInstallState } from "./status";

const AGENT_STATUS_POLL_MS = 1_000;

/** Agent status as the settings window shows it, plus clearing a provider and installing the hooks. */
export function useAgentStatusSettings() {
  const [agentStatus, setAgentStatus] =
    useState<AgentStatusSnapshot>(DEFAULT_AGENT_STATUS);
  const [clearingAgentProvider, setClearingAgentProvider] =
    useState<AgentProvider | null>(null);
  const [agentHooksInstallState, setAgentHooksInstallState] =
    useState<AgentHooksInstallState>("idle");
  const [agentHooksInstallResult, setAgentHooksInstallResult] =
    useState<AgentHooksInstallResult | null>(null);
  const [agentHooksInstallError, setAgentHooksInstallError] = useState("");

  const refreshAgentStatus = useCallback(async () => {
    try {
      const snapshot = await getAgentStatus();
      setAgentStatus((current) =>
        current.statusPath === snapshot.statusPath &&
        AGENT_PROVIDERS.every(
          (provider) =>
            current[provider].phase === snapshot[provider].phase &&
            current[provider].taskId === snapshot[provider].taskId,
        )
          ? current
          : snapshot,
      );
    } catch (error) {
      console.error("Failed to read agent status", error);
    }
  }, []);

  useEffect(() => {
    void refreshAgentStatus();
    const interval = window.setInterval(() => {
      void refreshAgentStatus();
    }, AGENT_STATUS_POLL_MS);
    return () => window.clearInterval(interval);
  }, [refreshAgentStatus]);

  const clearAgentStatus = useCallback(async (provider: AgentProvider) => {
    setClearingAgentProvider(provider);
    try {
      const snapshot = await clearAgentProviderStatus(provider);
      setAgentStatus(snapshot);
    } catch (error) {
      console.error("Failed to clear agent status", error);
    } finally {
      setClearingAgentProvider(null);
    }
  }, []);

  const installAgentHooks = useCallback(async () => {
    setAgentHooksInstallState("installing");
    setAgentHooksInstallError("");

    try {
      const result = await installAgentStatusHooks();
      setAgentHooksInstallResult(result);
      setAgentHooksInstallState("installed");
      void refreshAgentStatus();
    } catch (error) {
      console.error("Failed to install agent status hooks", error);
      setAgentHooksInstallError(getErrorMessage(error));
      setAgentHooksInstallState("error");
    }
  }, [refreshAgentStatus]);

  return {
    agentStatus,
    clearingAgentProvider,
    agentHooksInstallState,
    agentHooksInstallResult,
    agentHooksInstallError,
    onClearAgentStatus: clearAgentStatus,
    onInstallAgentHooks: installAgentHooks,
  };
}
