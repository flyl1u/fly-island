import type { AgentSessionSummary } from "../../features/agent-status/api";
import { alertKindsOf, useAgentAlerts } from "../../features/agent-status/useAgentAlerts";
import { useAgentSounds } from "../../features/agent-status/sounds/useAgentSounds";
import type { IslandSettings } from "../../features/appearance/types";
import type { IslandMode, IslandPage } from "./types";

type IslandAgentAlertsOptions = {
  sessions: AgentSessionSummary[];
  settings: IslandSettings;
  /** False while the Agent page is off or game mode keeps the island quiet. */
  enabled: boolean;
  mode: IslandMode;
  page: IslandPage;
  openIslandPage: (page: IslandPage) => void;
  collapseIsland: () => void;
};

/** What the island does when an agent session changes: sounds, and the Agent page opening by itself. */
export function useIslandAgentAlerts({ sessions, settings, enabled, mode, page, openIslandPage, collapseIsland }: IslandAgentAlertsOptions) {
  useAgentSounds(sessions, enabled);
  return useAgentAlerts({
    sessions,
    kinds: alertKindsOf(settings),
    durationMs: settings.agentAlertSeconds * 1000,
    canAlert: enabled,
    isOpenOnAgents: mode === "expanded" && page === "agents",
    isCollapsed: mode === "collapsed",
    onOpen: () => openIslandPage("agents"),
    onClose: collapseIsland,
  });
}
