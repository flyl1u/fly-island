import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { detectAlerts, phasesOf, takeDueReminders, trackWaiting, type AgentAlert, type AgentAlertKind, type AgentAlertKinds, type SessionPhases, type WaitingReminders } from "./alerts";
import { agentSessionsInFront, type AgentSessionSummary } from "./api";
import { sessionKey } from "./unseen";

export { alertKindsOf } from "./alerts";

/** While the cursor rests on the island (it holds the focus then), closing waits this long more. */
const HOVER_RETRY_MS = 1000;
/** How often sessions waiting on the user are checked for a reminder. */
const REMIND_CHECK_MS = 5000;

/**
 * The session an alert opened the Agent page for, which the page then shows alone. `session` is
 * the session as the alert saw it, for when the page's own list leaves it out (only running
 * sessions listed).
 */
export type AlertedSession = {
  key: string;
  kind: AgentAlertKind;
  session: AgentSessionSummary;
  /** The card's row height as the page measured it; the island's height follows it. */
  rowHeight: number;
  /** For the page to report the row's height when it renders or changes. */
  measure: (rowHeight: number) => void;
};

/** A row with a two-line reply (AgentSessionsPanel.css), until the card has measured its own. */
const DEFAULT_ROW_HEIGHT = 78;

type AgentAlertOptions = {
  sessions: AgentSessionSummary[];
  kinds: AgentAlertKinds;
  /** How long a panel opened for an alert stays before it closes by itself. */
  durationMs: number;
  /** False while game mode keeps the island quiet. */
  canAlert: boolean;
  /** Whether the island is expanded and on the Agent page, so an alert only closes its own panel. */
  isOpenOnAgents: boolean;
  isCollapsed: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** A session still waiting on the user this long pops up once more; 0: never. */
  remindAfterMs?: number;
  /** Hears about the sessions a reminder is for (whose windows are not in front), e.g. to play a sound. */
  onRemind?: (sessions: AgentSessionSummary[]) => void;
  /** Sessions the user has already looked at; no reminder about them (roadmap B15). */
  looked?: (session: AgentSessionSummary) => boolean;
};

/**
 * Opens the Agent page when a session finishes, fails or waits for the user, unless its window
 * is already in front or the user has the island open. The panel closes again after
 * `durationMs`, unless the user pressed inside it; resting the cursor on it holds it open.
 * Returns the session the page shows alone while the alert lasts: until the island collapses,
 * leaves the Agent page, or the user presses anywhere but the session's row (the page header's
 * Agent button, say), which brings back the whole list. With `remindAfterMs`, a session still
 * waiting on the user that long after it started waiting pops up once more.
 */
export function useAgentAlerts({ sessions, kinds, durationMs, canAlert, isOpenOnAgents, isCollapsed, onOpen, onClose, remindAfterMs = 0, onRemind, looked }: AgentAlertOptions) {
  const [alerted, setAlerted] = useState<Pick<AlertedSession, "key" | "kind" | "session"> | null>(null);
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);
  const phasesRef = useRef<SessionPhases | null>(null);
  const openedByAlertRef = useRef(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  // Read inside timers and the in-front check, which outlive a render.
  const latest = useRef({ durationMs, canAlert, isOpenOnAgents, isCollapsed, onOpen, onClose, onRemind, looked });
  useLayoutEffect(() => {
    latest.current = { durationMs, canAlert, isOpenOnAgents, isCollapsed, onOpen, onClose, onRemind, looked };
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

  /** Shows the newest of `alerts` whose window is not in front; `onShown` hears about each such alert first. */
  const popUpRef = useRef((alerts: AgentAlert[], onShown?: (shown: AgentAlert[]) => void) => {
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
        if (shown.length === 0 || !current.canAlert) return;
        onShown?.(shown);
        // Leave a panel the user opened alone; an alert's own panel just stays open longer.
        if (!(current.isCollapsed || openedByAlertRef.current)) return;
        const newest = shown[shown.length - 1];
        setAlerted({ key: sessionKey(newest.session), kind: newest.kind, session: newest.session });
        openedByAlertRef.current = true;
        current.onOpen();
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = window.setTimeout(close, current.durationMs);
      });
  });

  const { started, completed, failed, waiting } = kinds;
  useEffect(() => {
    const alerts = detectAlerts(phasesRef.current, sessions, { started, completed, failed, waiting });
    phasesRef.current = phasesOf(sessions, phasesRef.current);
    if (alerts.length > 0 && latest.current.canAlert) popUpRef.current(alerts);
  }, [sessions, started, completed, failed, waiting]);

  // A session still waiting on the user a while later pops up once more (roadmap B6.4.1).
  const remindersRef = useRef<WaitingReminders>({ since: new Map(), reminded: new Set() });
  const sessionsRef = useRef(sessions);
  useLayoutEffect(() => {
    sessionsRef.current = sessions;
  });
  useEffect(() => {
    if (remindAfterMs > 0) trackWaiting(remindersRef.current, sessions, Date.now());
  }, [sessions, remindAfterMs]);
  useEffect(() => {
    if (remindAfterMs <= 0 || !waiting) return;
    const check = () => {
      const due = takeDueReminders(remindersRef.current, sessionsRef.current, Date.now(), remindAfterMs, latest.current.looked);
      if (due.length > 0 && latest.current.canAlert) {
        popUpRef.current(due.map((session) => ({ kind: "waiting", session })), (shown) => latest.current.onRemind?.(shown.map((alert) => alert.session)));
      }
    };
    check();
    // Often enough for the delay (tests use short ones); real delays are 30 seconds and up.
    const timer = window.setInterval(check, Math.min(REMIND_CHECK_MS, Math.max(50, remindAfterMs / 4)));
    return () => window.clearInterval(timer);
  }, [remindAfterMs, waiting]);

  return useMemo(
    () => (alerted ? { ...alerted, rowHeight, measure: setRowHeight } : null),
    [alerted, rowHeight],
  );
}
