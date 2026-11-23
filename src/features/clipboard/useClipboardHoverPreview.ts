import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const HOVER_DELAY = 350;
const LEAVE_DELAY = 160;
const GAP = 4;
const EDGE = 6;
const MAX_HEIGHT = 240;

export function useClipboardHoverPreview(enabled: boolean, panelRef: RefObject<HTMLElement | null>) {
  const [preview, setPreview] = useState<{ id: string; above: boolean; offset: number; height: number } | null>(null);
  const timer = useRef(0);
  const hold = useCallback(() => window.clearTimeout(timer.current), []);
  const dismiss = useCallback(() => {
    hold();
    setPreview(null);
  }, [hold]);

  useEffect(() => {
    if (!enabled) dismiss();
    return hold;
  }, [enabled, dismiss, hold]);

  useEffect(() => {
    if (!preview || !enabled) return;
    window.addEventListener("resize", dismiss);
    return () => window.removeEventListener("resize", dismiss);
  }, [preview, enabled, dismiss]);

  const start = (id: string, anchor: HTMLElement) => {
    // Re-entering the source from the preview keeps it open.
    hold();
    if (!enabled || id === preview?.id) return;
    setPreview(null);
    timer.current = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || !anchor.isConnected || !panel.offsetWidth) return;
      const panelRect = panel.getBoundingClientRect();
      const row = anchor.getBoundingClientRect();
      // The expanded island can be scaled. Offsets inside the panel are in unscaled pixels.
      const scale = panelRect.width / panel.offsetWidth;
      if (scale <= 0) return;
      const top = Math.max(0, (row.top - panelRect.top) / scale);
      const bottom = Math.min(panel.clientHeight, (row.bottom - panelRect.top) / scale);
      if (bottom <= top) return;
      const below = panel.clientHeight - bottom;
      const above = below < MAX_HEIGHT + GAP + EDGE && top > below;
      setPreview({
        id, above,
        offset: (above ? panel.clientHeight - top : bottom) + GAP,
        height: Math.min(MAX_HEIGHT, (above ? top : below) - GAP - EDGE),
      });
    }, HOVER_DELAY);
  };

  const leave = () => {
    hold();
    if (preview) timer.current = window.setTimeout(dismiss, LEAVE_DELAY);
  };

  return { preview: enabled ? preview : null, start, leave, hold, dismiss };
}
