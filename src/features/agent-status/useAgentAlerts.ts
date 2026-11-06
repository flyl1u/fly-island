import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { detectAlerts, phasesOf, type AgentAlertKind, type SessionPhases } from "./alerts";
import { agentSessionsInFront, type AgentSessionSummary } from "./api";
import { sessionKey } from "./unseen";

/** While the cursor rests on the island (it holds the focus then), closing waits this long more. */
const HOVER_RETRY_MS = 1000;

/**
 * The session an alert opened the Agent page for, which the page then shows alone. `session` is
 * the session as the alert saw it, for when the page's own list leaves it out (only running
 * sessions listed).
 */
export type AlertedSession = { key: string; kind: AgentAlertKind; session: AgentSessionSummary };

type AgentAlertOptions = {
  sessions: AgentSessionSummary[];
  kinds: Record<AgentAlertKind, boolean>;
  /** How long a panel opened for an alert stays before it closes by itself. */
  durationMs: number;
  /** False while game mode keeps the island quiet. */
  canAlert: boolean;
  /** Whether the island is expanded and on the Agent page, so an alert only closes its own panel. */
  isOpenOnAgents: boolean;
  isCollapsed: boolean;
  onOpen: () => void;
  onClose: () => void;
};

/**
 * Opens the Agent page when a session finishes, fails or waits for the user, unless its window
 * is already in front or the user has the island open. The panel closes again after
 * `durationMs`, unless the user pressed inside it; resting the cursor on it holds it open.
 * Returns the session the page shows alone while the alert lasts: until the island collapses,
 * leaves the Agent page, or the user presses anywhere but the session's row (the page header's
 * Agent button, say), which brings back the whole list.
 */
export function useAgentAlerts({ sessions, kinds, durationMs, canAlert, isOpenOnAgents, isCollapsed, onOpen, onClose }: AgentAlertOptions) {
  const [alerted, setAlerted] = useState<AlertedSession | null>(null);
  const phasesRef = useRef<SessionPhases | null>(null);
  const openedByAlertRef = useRef(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  // Read inside timers and the in-front check, which outlive a render.
  const latest = useRef({ durationMs, canAlert, isOpenOnAgents, isCollapsed, onOpen, onClose });
  useLayoutEffect(() => {
    latest.current = { durationMs, canAlert, isOpenOnAgents, isCollapsed, onOpen, onClose };
  });

  useEffect(() => {
    // A press inside the panel means the user took it over: it no longer closes by itself, and
    // anywhere but the alerted row it is the whole Agent page again.
    const keepOpen = (event: PointerEvent) => {
      openedByAlertRef.current = false;
      window.clearTimeout(closeTimerRef.current);
      if (!(event.target instanceof Element && event.target.closest(".agent-sessions__list"))) setAlerted(null);
    };
    window.addEventListener("pointerdown", keepOpen, true);
    return () => {
      window.removeEventListener("pointerdown", keepOpen, true);
      window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isCollapsed) {
      openedByAlertRef.current = false;
      window.clearTimeout(closeTimerRef.current);
    }
  }, [isCollapsed]);

  // Collapsing or moving to another page ends the alert's one-session view. Not while collapsed:
  // the alert sets its session just before the island opens.
  const leftAgentPage = !isCollapsed && !isOpenOnAgents;
  const wasExpandedRef = useRef(!isCollapsed);
  useEffect(() => {
    const collapsedNow = isCollapsed && wasExpandedRef.current;
    wasExpandedRef.current = !isCollapsed;
    if (collapsedNow || leftAgentPage) setAlerted(null);
  }, [isCollapsed, leftAgentPage]);

  const { completed, failed, waiting } = kinds;
  useEffect(() => {
    const alerts = detectAlerts(phasesRef.current, sessions, { completed, failed, waiting });
    phasesRef.current = phasesOf(sessions);
    if (alerts.length === 0 || !latest.current.canAlert) return;

    const close = () => {
      if (!openedByAlertRef.current) return;
      // The island takes the focus while the cursor rests on it.
      if (document.hasFocus()) {
        closeTimerRef.current = window.setTimeout(close, HOVER_RETRY_MS);
        return;
      }
      openedByAlertRef.current = false;
      if (latest.current.isOpenOnAgents) latest.current.onClose();
    };

    void agentSessionsInFront(alerts.map((alert) => alert.session))
      .catch((error: unknown) => {
        console.error("Failed to check which agent windows are in front", error);
        return [] as string[];
      })
      .then((inFront) => {
        const shown = alerts.filter((alert) => !inFront.includes(alert.session.sessionId));
        const current = latest.current;
        // Leave a panel the user opened alone; an alert's own panel just stays open longer.
        if (shown.length === 0 || !current.canAlert || !(current.isCollapsed || openedByAlertRef.current)) return;
        const newest = shown[shown.length - 1];
        setAlerted({ key: sessionKey(newest.session), kind: newest.kind, session: newest.session });
        openedByAlertRef.current = true;
        current.onOpen();
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = window.setTimeout(close, current.durationMs);
      });
  }, [sessions, completed, failed, waiting]);

  return alerted;
}
