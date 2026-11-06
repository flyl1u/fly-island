import { useMemo } from "react";
import { IslandHoverCard } from "../../components/IslandHoverCard";
import { MiniRing } from "../../components/MiniRing";
import { useTranslation } from "../../i18n";
import type { AgentSessionSummary } from "../agent-status/api";
import { sessionRingCardLines, sessionRingSegments, sessionRingSummary, type SessionRingCounts } from "./ringCounts.ts";
import "./SessionRing.css";

/** Outer size of the ring in px; it takes the blue session count's place. */
export const SESSION_RING_SIZE = 20;

type SessionRingProps = {
  sessions: readonly AgentSessionSummary[];
  unseen: ReadonlySet<string>;
  counts: SessionRingCounts;
  now: number;
  /** Opens the Agent page. */
  onOpen: () => void;
};

/** The island's agent sessions as one segmented ring on the collapsed bar, the count in the middle. */
export function SessionRing({ sessions, unseen, counts, now, onOpen }: SessionRingProps) {
  const t = useTranslation();
  const summary = sessionRingSummary(counts, t.sessionRing);
  const lines = useMemo(
    () => sessionRingCardLines(sessions, unseen, now, t.sessionRing).map((text) => ({ text })),
    [sessions, unseen, now, t.sessionRing],
  );
  return (
    <IslandHoverCard lines={lines}>
      <button
        className="session-ring session-ring--button"
        type="button"
        aria-label={t.sessionRing.openAgents(summary)}
        onClick={(event) => {
          // The bar itself opens the island on a click; this one goes to the Agent page.
          event.stopPropagation();
          onOpen();
        }}
      >
        <MiniRing segments={sessionRingSegments(counts)} size={SESSION_RING_SIZE} label={String(counts.total)} ariaLabel={summary} />
      </button>
    </IslandHoverCard>
  );
}
