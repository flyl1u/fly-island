import { useEffect, useLayoutEffect, useRef } from "react";
import type { AgentSessionSummary } from "../../features/agent-status/api";
import { sessionKey } from "../../features/agent-status/unseen";
import { useAgentApprovals } from "../../features/agent-status/approvals/useAgentApprovals";
import { useAgentApprovalSettings } from "../../features/agent-status/approvals/useAgentApprovalSettings";
import { alertKindsOf, useAgentAlerts } from "../../features/agent-status/useAgentAlerts";
import { useAgentSounds } from "../../features/agent-status/sounds/useAgentSounds";
import { useAgentPush } from "../../features/agent-status/push/useAgentPush";
import { reminderSound } from "../../features/agent-status/sounds/events";
import { playAgentSound } from "../../features/agent-status/sounds/player";
import { useAgentSoundSettings } from "../../features/agent-status/sounds/useAgentSoundSettings";
import type { IslandSettings } from "../../features/appearance/types";
import type { IslandMode, IslandPage } from "./types";
import { useOutsideClick } from "./useOutsideClick";

type IslandAgentAlertsOptions = {
  sessions: AgentSessionSummary[];
  /** Sessions the user has not looked at; only these are reminded about again. */
  unseen: ReadonlySet<string>;
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
export function useIslandAgentAlerts({ sessions, unseen, settings, enabled, mode, page, openIslandPage, collapseIsland }: IslandAgentAlertsOptions) {
  const isOpenOnAgents = mode === "expanded" && page === "agents";
  // Whether an alert or a card opened the Agent page and the user has not taken it over since.
  // The alert and the card each track their own opening and miss the other's: an alert opens the
  // page, a card comes onto it and so thinks the user opened it, and a press on the card tells the
  // alert the user took over; neither then closed the page. Closing is decided here instead.
  const autoOpenedRef = useRef(false);
  const onOpen = () => {
    autoOpenedRef.current = true;
    openIslandPage("agents");
  };
  const [approvalSettings] = useAgentApprovalSettings();
  const approvals = useAgentApprovals({ enabled: enabled && approvalSettings.onIsland, whenInFront: approvalSettings.whenInFront, isOpenOnAgents, onOpen, onClose: collapseIsland });
  const waiting = approvals.current !== null;
  const waitingRef = useRef(waiting);
  useLayoutEffect(() => {
    waitingRef.current = waiting;
  }, [waiting]);

  // A press anywhere but on a card is the user taking the island over.
  useEffect(() => {
    const takeOver = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest(".agent-approval"))) autoOpenedRef.current = false;
    };
    window.addEventListener("pointerdown", takeOver, true);
    return () => window.removeEventListener("pointerdown", takeOver, true);
  }, []);

  // Leaving the Agent page or collapsing ends it too.
  const wasOpenOnAgentsRef = useRef(isOpenOnAgents);
  useEffect(() => {
    if (wasOpenOnAgentsRef.current && !isOpenOnAgents) autoOpenedRef.current = false;
    wasOpenOnAgentsRef.current = isOpenOnAgents;
  }, [isOpenOnAgents]);

  // The last card went (answered on the island or in the terminal, Esc, timed out): a page that
  // opened by itself closes again.
  const wasWaitingRef = useRef(waiting);
  useEffect(() => {
    const ended = wasWaitingRef.current && !waiting;
    wasWaitingRef.current = waiting;
    if (ended && autoOpenedRef.current && isOpenOnAgents) {
      autoOpenedRef.current = false;
      collapseIsland();
    }
  }, [waiting, isOpenOnAgents, collapseIsland]);

  useAgentSounds(sessions, enabled, unseen);
  // Not muted by game mode: the user is not looking at the agents then either.
  useAgentPush(sessions, settings.agentStatusEnabled);
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
    looked: (session) => !unseen.has(sessionKey(session)),
  });
  // A click elsewhere on the screen closes an alert's one-session view (roadmap B6.5.3), like a
  // popover. Not a card's: a request waits on it, and closing would leave it hanging.
  useOutsideClick(alertedSession !== null && !waiting && isOpenOnAgents, collapseIsland);
  const agentCardHeight = approvals.current ? approvals.cardHeight : alertedSession?.rowHeight;
  return { alertedSession, approvals, agentCardHeight };
}
