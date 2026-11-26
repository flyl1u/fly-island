import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { SHRINK_DELAY_MS } from "./useCollapsedWidthMotion";
import "./CollapsedPresence.css";

export function CollapsedPresence({ children, className, animate }: { children: ReactNode; className: string; animate: boolean }) {
  const shown = Boolean(children);
  const [previouslyShown, setPreviouslyShown] = useState(shown);
  const [leaving, setLeaving] = useState(false);
  const last = useRef(children);
  if (shown !== previouslyShown) {
    setPreviouslyShown(shown);
    setLeaving(!shown && animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  useLayoutEffect(() => {
    if (shown) last.current = children;
    else if (!leaving) last.current = null;
  }, [children, leaving, shown]);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(false), SHRINK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  if (!shown && (!leaving || !animate)) return null;
  return <div className={className} data-collapsed-presence={animate ? (leaving ? "leaving" : "shown") : undefined}
    inert={leaving} aria-hidden={leaving || undefined}>{shown ? children : last.current}</div>;
}
