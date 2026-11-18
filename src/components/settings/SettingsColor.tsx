import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { hexToHsv, hsvToHex, type Hsv } from "./colorSpace";
import "./SettingsColor.css";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * A colour as a settings row shows it: its hex value, then a swatch that opens the picker.
 * The picker is drawn in the page, not the browser's: WebView2's own picker reports the colour
 * only once it is let go, and the island should follow the drag (2026-11-18). Changes are
 * reported at most once a frame, and each one reaches the island through storage at once.
 */
export function SettingsColor({
  value,
  ariaLabel,
  onChange,
  valueControl,
}: {
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  valueControl?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Kept while open so a grey (no hue) does not snap the hue strip back to red.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open && hsvToHex(hsv) !== value.toUpperCase()) setHsv(hexToHsv(value));
  }, [open, value, hsv]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const report = (next: Hsv) => {
    setHsv(next);
    pendingRef.current = hsvToHex(next);
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      if (pendingRef.current) onChange(pendingRef.current);
      pendingRef.current = null;
    });
  };

  const drag = (pick: (x: number, y: number) => Hsv) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const at = (pointer: { clientX: number; clientY: number }) => {
      const box = target.getBoundingClientRect();
      report(pick(clamp((pointer.clientX - box.left) / box.width), clamp((pointer.clientY - box.top) / box.height)));
    };
    at(event);
    const move = (next: PointerEvent) => at(next);
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const step = (event: KeyboardEvent, axis: "s" | "v" | "h") => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    const direction = keys[event.key];
    if (!direction) return;
    event.preventDefault();
    if (axis === "h") report({ ...hsv, h: (hsv.h + direction * 4 + 360) % 360 });
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") report({ ...hsv, s: clamp(hsv.s + direction * 0.02) });
    else report({ ...hsv, v: clamp(hsv.v + direction * 0.02) });
  };

  const hex = open ? hsvToHex(hsv) : value.toUpperCase();
  return (
    <div className="settings-color" ref={rootRef}>
      {valueControl ?? <span className="settings-color__value">{hex}</span>}
      <button
        className="settings-color__swatch"
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        style={{ background: hex }}
        onClick={() => setOpen((shown) => !shown)}
        onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}
      />
      {open && (
        <div className="settings-color__picker" role="dialog" aria-label={ariaLabel}
          style={{ "--picker-hue": `hsl(${hsv.h} 100% 50%)` } as CSSProperties}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
          <div className="settings-color__area" tabIndex={0} role="slider" aria-label={ariaLabel}
            aria-valuetext={hex} onPointerDown={drag((x, y) => ({ ...hsv, s: x, v: 1 - y }))} onKeyDown={(event) => step(event, "s")}>
            <span className="settings-color__thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
          </div>
          <div className="settings-color__hue" tabIndex={0} role="slider" aria-valuemin={0} aria-valuemax={360}
            aria-valuenow={Math.round(hsv.h)} onPointerDown={drag((x) => ({ ...hsv, h: x * 359.9 }))} onKeyDown={(event) => step(event, "h")}>
            <span className="settings-color__thumb" style={{ left: `${(hsv.h / 360) * 100}%`, top: "50%", background: "var(--picker-hue)" }} />
          </div>
        </div>
      )}
    </div>
  );
}
