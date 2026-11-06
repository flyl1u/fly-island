import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { agentSessionsInFront } from "../api";
import {
  decideAgentApproval,
  getPendingAgentApprovals,
  setAgentApprovalEnabled,
  listenAgentApprovalClosed,
  listenAgentApprovalRequested,
  type AgentApprovalDecision,
  type AgentApprovalRequest,
} from "./api";

/** The card's height until it has measured itself: a heading, two lines of command and the buttons. */
const DEFAULT_CARD_HEIGHT = 118;

export type AgentApprovals = {
  /** The request on the card; the others wait behind it, oldest first. */
  current: AgentApprovalRequest | null;
  /** How many more are waiting. */
  queued: number;
  decide: (decision: AgentApprovalDecision) => void;
  /** The card's height as it measured it; the island's height follows it. */
  cardHeight: number;
  measure: (height: number) => void;
};

type AgentApprovalOptions = {
  /** False while the Agent page is off or game mode keeps the island quiet: requests go straight back to the terminal. */
  enabled: boolean;
  isOpenOnAgents: boolean;
  onOpen: () => void;
  onClose: () => void;
};

const TYPING_RETRY_MS = 1000;

/** The user is writing in one of the island's own fields (a todo, a translation). */
function isTyping() {
  const element = document.activeElement;
  return element instanceof HTMLElement && (element.isContentEditable || element.matches("input, textarea"));
}

function report(error: unknown) {
  console.error("Failed to answer an agent permission request", error);
}

/**
 * Permission requests agents' hooks hold open for the island (roadmap B6 phase 2). The agent's
 * terminal shows no prompt of its own meanwhile, so a request the user cannot see here goes back
 * at once: while the island is quiet, or when the session's own window is already in front.
 * The first request opens the Agent page; once the last one is gone a page it opened closes again.
 */
export function useAgentApprovals({ enabled, isOpenOnAgents, onOpen, onClose }: AgentApprovalOptions): AgentApprovals {
  const [queue, setQueue] = useState<AgentApprovalRequest[]>([]);
  const [cardHeight, setCardHeight] = useState(DEFAULT_CARD_HEIGHT);
  const openedRef = useRef(false);
  const latest = useRef({ enabled, isOpenOnAgents, onOpen, onClose });
  useLayoutEffect(() => {
    latest.current = { enabled, isOpenOnAgents, onOpen, onClose };
  });

  const drop = useCallback((id: number) => setQueue((items) => items.filter((item) => item.id !== id)), []);

  useEffect(() => {
    const handBack = (request: AgentApprovalRequest) => {
      void decideAgentApproval(request.id, "terminal").catch(report);
    };
    const admit = (request: AgentApprovalRequest) => {
      if (!latest.current.enabled) return handBack(request);
      void agentSessionsInFront([{ provider: request.agent, sessionId: request.sessionId }])
        .catch(() => [] as string[])
        .then((inFront) => {
          if (inFront.includes(request.sessionId) || !latest.current.enabled) handBack(request);
          else setQueue((items) => (items.some((item) => item.id === request.id) ? items : [...items, request]));
        });
    };

    let cancelled = false;
    const stops: (() => void)[] = [];
    const keep = (stop: () => void) => (cancelled ? stop() : stops.push(stop));
    void listenAgentApprovalRequested(admit).then(keep).catch(report);
    void listenAgentApprovalClosed((closed) => drop(closed.id)).then(keep).catch(report);
    // Requests that arrived before this window (re)loaded.
    void getPendingAgentApprovals()
      .then((pending) => {
        if (!cancelled) pending.forEach(admit);
      })
      .catch(report);
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, [drop]);

  // Off, the endpoint answers hooks itself (back to the terminal) without asking the island.
  useEffect(() => {
    void setAgentApprovalEnabled(enabled).catch(report);
  }, [enabled]);

  // Quiet now: what is still waiting goes back to the terminal.
  useEffect(() => {
    if (enabled || queue.length === 0) return;
    queue.forEach((request) => void decideAgentApproval(request.id, "terminal").catch(report));
    setQueue([]);
  }, [enabled, queue]);

  const current = queue[0] ?? null;
  const currentId = current?.id ?? null;
  // Each request opens the Agent page once; not over the user's typing (it waits until they stop),
  // and not again after the user moved to another page.
  useEffect(() => {
    if (currentId === null) {
      if (openedRef.current && latest.current.isOpenOnAgents) latest.current.onClose();
      openedRef.current = false;
      return;
    }
    let timer: number | undefined;
    const open = () => {
      if (latest.current.isOpenOnAgents) return;
      if (isTyping()) {
        timer = window.setTimeout(open, TYPING_RETRY_MS);
        return;
      }
      openedRef.current = true;
      latest.current.onOpen();
    };
    open();
    return () => window.clearTimeout(timer);
  }, [currentId]);

  // The user left the Agent page: the island is theirs again, nothing to close afterwards.
  useEffect(() => {
    if (!isOpenOnAgents) openedRef.current = false;
  }, [isOpenOnAgents]);

  const decide = useCallback(
    (decision: AgentApprovalDecision) => {
      if (!current) return;
      drop(current.id);
      void decideAgentApproval(current.id, decision).catch(report);
    },
    [current, drop],
  );

  return useMemo(
    () => ({ current, queued: Math.max(0, queue.length - 1), decide, cardHeight, measure: setCardHeight }),
    [current, queue.length, decide, cardHeight],
  );
}
