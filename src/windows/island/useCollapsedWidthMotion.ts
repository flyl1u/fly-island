import { useEffect, useState } from "react";

/** The shape's width animation (IslandShell.css `.island--width-motion`). */
export const WIDTH_MOTION_MS = 400;
/** A narrower width waits this long, so the text swaps first and quick changes settle (B3-3). */
export const SHRINK_DELAY_MS = 120;
const SPRING_SETTLE_MS = 600;

/**
 * Smooths the collapsed width: a wider target applies at once (the island widens before the new
 * text shows); a narrower one after SHRINK_DELAY_MS, and only if nothing wider came meanwhile.
 * `enabled` selects the width curve while stably collapsed (never for opening or
 * closing, which have their own spring); `hitWidth` is what the native hit test should use: it
 * grows with the target and shrinks only after the animation has ended.
 */
export function useCollapsedWidthMotion(target: number, collapsed: boolean) {
  const [appliedWidth, setAppliedWidth] = useState(target);
  const [lastHitWidth, setLastHitWidth] = useState(target);
  const [phase, setPhase] = useState({ collapsed, settled: collapsed });
  if (phase.collapsed !== collapsed) setPhase({ collapsed, settled: false });
  const enabled = collapsed && phase.collapsed && phase.settled;
  const width = !enabled || target >= appliedWidth ? target : appliedWidth;
  if (width !== appliedWidth) setAppliedWidth(width);
  const hitWidth = !collapsed || width >= lastHitWidth ? width : lastHitWidth;
  if (hitWidth !== lastHitWidth) setLastHitWidth(hitWidth);

  useEffect(() => {
    if (!enabled || target >= width) return;
    const timer = window.setTimeout(() => setAppliedWidth(target), SHRINK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, target, width]);

  useEffect(() => {
    if (!collapsed || phase.settled) return;
    const timer = window.setTimeout(() => setPhase({ collapsed: true, settled: true }), SPRING_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [collapsed, phase.settled]);

  useEffect(() => {
    if (width >= hitWidth) return;
    const timer = window.setTimeout(() => setLastHitWidth(width), (enabled ? WIDTH_MOTION_MS : SPRING_SETTLE_MS) + 32);
    return () => window.clearTimeout(timer);
  }, [enabled, width, hitWidth]);

  return { width, enabled, hitWidth };
}
