import { useLayoutEffect, useState } from "react";
import type { AgentSessionSummary } from "./api";
import { sessionKey } from "./unseen";
import type { SessionRemoval } from "./useHiddenSessions";

const LEAVE_MS = 260;
const RETURN_MS = 240;
const EASING = "cubic-bezier(0.2, 0.7, 0.3, 1)";
/** How far a row slides right as it fades, before its height folds away. */
const SLIDE_PX = 18;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Archiving a row with motion: it slides right and fades, then its height folds and the rows
 * below move up; only then does the session leave the list (the island's height follows the row
 * count, so it shrinks after the row has gone). Undo unfolds the row back the same way.
 */
export function useArchiveMotion(list: HTMLElement | null, removal: SessionRemoval | undefined) {
  const [returning, setReturning] = useState<string | null>(null);
  const row = (key: string) => list?.querySelector<HTMLElement>(`[data-session-key="${CSS.escape(key)}"]`) ?? null;

  // Undo puts the session back in the same render that sets `returning`, so the row is in the
  // list when this runs and unfolds before the first paint.
  useLayoutEffect(() => {
    if (!returning) return;
    const element = list?.querySelector<HTMLElement>(`[data-session-key="${CSS.escape(returning)}"]`);
    if (element && !reducedMotion()) {
      const height = element.offsetHeight;
      element.style.overflow = "hidden";
      element
        .animate(
          [
            { opacity: 0, transform: `translateX(${SLIDE_PX}px)`, height: "0px" },
            { opacity: 0, transform: `translateX(${SLIDE_PX}px)`, height: `${height}px`, offset: 0.45 },
            { opacity: 1, transform: "translateX(0)", height: `${height}px` },
          ],
          { duration: RETURN_MS, easing: EASING },
        )
        .finished.finally(() => element.style.removeProperty("overflow"))
        .catch(() => undefined);
    }
    setReturning(null);
  }, [returning, list]);

  const archive = (session: AgentSessionSummary) => {
    if (!removal) return;
    const element = row(sessionKey(session));
    if (!element || reducedMotion()) {
      removal.remove(session);
      return;
    }
    const height = element.offsetHeight;
    element.style.overflow = "hidden";
    element.style.pointerEvents = "none";
    const animation = element.animate(
      [
        { opacity: 1, transform: "translateX(0)", height: `${height}px` },
        { opacity: 0, transform: `translateX(${SLIDE_PX}px)`, height: `${height}px`, offset: 0.5 },
        { opacity: 0, transform: `translateX(${SLIDE_PX}px)`, height: "0px" },
      ],
      { duration: LEAVE_MS, easing: EASING, fill: "forwards" },
    );
    void animation.finished
      .catch(() => undefined)
      .finally(() => {
        removal.remove(session);
        // Normally the row is gone by the next frame; if it stays (the removal did not take),
        // it comes back rather than staying folded away.
        requestAnimationFrame(() => {
          animation.cancel();
          element.style.removeProperty("overflow");
          element.style.removeProperty("pointer-events");
        });
      });
  };

  const undo = () => {
    if (!removal?.removed) return;
    setReturning(sessionKey(removal.removed));
    removal.undo();
  };

  return { archive, undo };
}
