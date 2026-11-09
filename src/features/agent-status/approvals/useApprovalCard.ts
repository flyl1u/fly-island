import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listenAgentApprovalHotkey, setAgentApprovalHotkeys, type AgentApprovalDecision, type APPROVAL_HOTKEYS } from "./api";
import type { AgentApprovals } from "./useAgentApprovals";

/** A card that appears under a click or key press about to land is not answered by it. */
export const APPROVAL_ARM_MS = 500;

/**
 * What every card on the Agent page for a waiting request shares: it can be answered only once
 * `armed`, its `hotkeys` are registered only while it is armed and showing, and it reports its
 * height (through `cardRef`) for the island to fit it. A hotkey press calls `actRef.current`.
 */
export function useApprovalCard(approvals: AgentApprovals, hotkeys: typeof APPROVAL_HOTKEYS) {
  const [armed, setArmed] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const actRef = useRef<(action: AgentApprovalDecision) => void>(() => {});
  const { measure } = approvals;
  const id = approvals.current?.id;

  useEffect(() => {
    setArmed(false);
    const timer = window.setTimeout(() => setArmed(true), APPROVAL_ARM_MS);
    return () => window.clearTimeout(timer);
  }, [id]);

  useEffect(() => {
    if (!armed || !id) return;
    const failed = (error: unknown) => console.error("Failed to set the approval shortcuts", error);
    let stop: (() => void) | undefined;
    let cancelled = false;
    void listenAgentApprovalHotkey((action) => actRef.current(action))
      .then((unlisten) => (cancelled ? unlisten() : (stop = unlisten)))
      .catch(failed);
    void setAgentApprovalHotkeys(hotkeys).catch(failed);
    return () => {
      cancelled = true;
      stop?.();
      void setAgentApprovalHotkeys([]).catch(failed);
    };
  }, [armed, id, hotkeys]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const report = () => measure(card.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(card);
    return () => observer.disconnect();
  }, [measure, id]);

  return { armed, cardRef, actRef };
}
