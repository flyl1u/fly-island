import { useState } from "react";
import "./ScreenshotTooltips.css";

/** One fixed tooltip avoids clipping and keeps labels inside small/high-DPI viewports. */
export function ScreenshotTooltips({ children }: { children: React.ReactNode }) {
  const [hint, setHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const show = (target: EventTarget | null) => {
    const node = target instanceof Element ? target.closest<HTMLElement>("button[aria-label], button[title]") : null;
    if (!node) { setHint(null); return; }
    const box = node.getBoundingClientRect();
    const margin = Math.min(130, innerWidth / 2);
    setHint({ text: node.title || node.getAttribute("aria-label") || "", x: Math.min(innerWidth - margin, Math.max(margin, box.x + box.width / 2)),
      y: box.top >= 64 ? box.top - 8 : box.bottom + 44 });
  };
  return <div className="screenshot-tooltip-host" onPointerOver={(event) => show(event.target)} onPointerLeave={() => setHint(null)}
    onFocus={(event) => show(event.target)} onBlur={() => setHint(null)} onPointerDown={() => setHint(null)}>
    {children}
    {hint ? <span role="tooltip" className="screenshot-tooltip" style={{ left: hint.x, top: hint.y }}>{hint.text}</span> : null}
  </div>;
}
