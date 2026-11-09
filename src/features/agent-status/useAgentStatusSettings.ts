import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../../utils/error";
import { clearAgentProviderStatus, getAgentHooksState, getAgentStatus, installAgentStatusHooks, type AgentHooksInstallResult, type AgentHooksState, type AgentStatusSnapshot } from "./api";
import { AGENT_PROVIDERS, DEFAULT_AGENT_STATUS, type AgentHooksInstallState } from "./status";

const AGENT_STATUS_POLL_MS = 1_000;

/** Agent status as the settings window shows it, plus clearing a provider and installing the hooks. */
export function useAgentStatusSettings() {
  const [agentStatus, setAgentStatus] =
    useState<AgentStatusSnapshot>(DEFAULT_AGENT_STATUS);
  const [clearingAgentProvider, setClearingAgentProvider] =
    useState<string | null>(null);
  const [agentHooksInstallState, setAgentHooksInstallState] =
    useState<AgentHooksInstallState>("idle");
  const [agentHooksInstallResult, setAgentHooksInstallResult] =
    useState<AgentHooksInstallResult | null>(null);
  const [agentHooksInstallError, setAgentHooksInstallError] = useState("");
  const [agentHooksState, setAgentHooksState] = useState<AgentHooksState | null>(null);

  // The configs only change on Install/Repair (or by hand), so they are read on open and after installing.
  const refreshAgentHooksState = useCallback(async () => {
    try {
      setAgentHooksState(await getAgentHooksState());
    } catch (error) {
      console.error("Failed to read agent hooks state", error);
    }
  }, []);

  useEffect(() => {
    void refreshAgentHooksState();
  }, [refreshAgentHooksState]);

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
  }, [refreshAgentHooksState, refreshAgentStatus]);

  const clearAgentStatus = useCallback(async (provider: string) => {
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
      void refreshAgentHooksState();
    } catch (error) {
      console.error("Failed to install agent status hooks", error);
      setAgentHooksInstallError(getErrorMessage(error));
      setAgentHooksInstallState("error");
    }
  }, [refreshAgentHooksState, refreshAgentStatus]);

  return {
    agentStatus,
    clearingAgentProvider,
    agentHooksInstallState,
    agentHooksInstallResult,
    agentHooksInstallError,
    agentHooksState,
    onClearAgentStatus: clearAgentStatus,
    onInstallAgentHooks: installAgentHooks,
  };
}
