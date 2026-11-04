import { useCallback, useEffect, useRef, useState } from "react";
import { getAgentStatus, type AgentStatusSnapshot } from "./api";
import { AGENT_PROVIDERS, DEFAULT_AGENT_STATUS } from "./status";

/**
 * Polls agent status and keeps the previous snapshot when nothing the island renders has changed.
 * With `enabled` false (the status light switched off) it stops polling and reports idle.
 */
export function useAgentStatus(enabled = true) {
  const [agentStatus, setAgentStatus] =
    useState<AgentStatusSnapshot>(DEFAULT_AGENT_STATUS);
  const isRefreshingAgentStatus = useRef(false);

  const refreshAgentStatus = useCallback(async () => {
    if (isRefreshingAgentStatus.current) {
      return;
    }

    isRefreshingAgentStatus.current = true;
    try {
      const snapshot = await getAgentStatus();
      setAgentStatus((currentState) =>
        currentState.statusPath === snapshot.statusPath &&
        AGENT_PROVIDERS.every((provider) =>
          currentState[provider].phase === snapshot[provider].phase &&
          currentState[provider].taskId === snapshot[provider].taskId,
        )
          ? currentState
          : snapshot,
      );
    } catch (error) {
      console.error("Failed to read agent status", error);
      setAgentStatus(DEFAULT_AGENT_STATUS);
    } finally {
      isRefreshingAgentStatus.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setAgentStatus(DEFAULT_AGENT_STATUS);
      return;
    }

    void refreshAgentStatus();

    const interval = window.setInterval(() => {
      void refreshAgentStatus();
    }, 200);

    return () => window.clearInterval(interval);
  }, [enabled, refreshAgentStatus]);

  return agentStatus;
}
