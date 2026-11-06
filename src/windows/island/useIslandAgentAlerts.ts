import { useLayoutEffect, useRef } from "react";
import type { AgentSessionSummary } from "../../features/agent-status/api";
import { useAgentApprovals } from "../../features/agent-status/approvals/useAgentApprovals";
import { useAgentApprovalSettings } from "../../features/agent-status/approvals/useAgentApprovalSettings";
import { alertKindsOf, useAgentAlerts } from "../../features/agent-status/useAgentAlerts";
import { useAgentSounds } from "../../features/agent-status/sounds/useAgentSounds";
import { reminderSound } from "../../features/agent-status/sounds/events";
import { playAgentSound } from "../../features/agent-status/sounds/player";
import { useAgentSoundSettings } from "../../features/agent-status/sounds/useAgentSoundSettings";
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

/**
 * What the island does when an agent session changes: sounds, the Agent page opening by itself,
 * and permission requests waiting on the user. A request's card outranks an alert, so the island
 * fits the card and an alert's timer does not close it under a request still waiting.
 */
export function useIslandAgentAlerts({ sessions, settings, enabled, mode, page, openIslandPage, collapseIsland }: IslandAgentAlertsOptions) {
  const isOpenOnAgents = mode === "expanded" && page === "agents";
  const onOpen = () => openIslandPage("agents");
  const [approvalSettings] = useAgentApprovalSettings();
  const approvals = useAgentApprovals({ enabled: enabled && approvalSettings.onIsland, isOpenOnAgents, onOpen, onClose: collapseIsland });
  const waiting = approvals.current !== null;
  const waitingRef = useRef(waiting);
  useLayoutEffect(() => {
    waitingRef.current = waiting;
  }, [waiting]);

  useAgentSounds(sessions, enabled);
  const [soundSettings] = useAgentSoundSettings();
  // A reminder sounds like the wait it is about, if that sound is on.
  const remind = (reminded: AgentSessionSummary[]) => {
    const event = reminderSound(reminded[reminded.length - 1]);
    if (soundSettings.enabled && soundSettings.events[event]) playAgentSound(event, soundSettings);
  };
  const alertedSession = useAgentAlerts({
    sessions,
    kinds: alertKindsOf(settings),
    durationMs: settings.agentAlertSeconds * 1000,
    canAlert: enabled,
    isOpenOnAgents,
    isCollapsed: mode === "collapsed",
    onOpen,
    onClose: () => {
      if (!waitingRef.current) collapseIsland();
    },
    remindAfterMs: settings.agentRemindSeconds * 1000,
    onRemind: remind,
  });
  const agentCardHeight = approvals.current ? approvals.cardHeight : alertedSession?.rowHeight;
  return { alertedSession, approvals, agentCardHeight };
}
