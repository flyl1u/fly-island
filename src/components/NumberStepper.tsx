import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslation } from "../i18n";
import { parseStepperInput, stepStepperValue } from "../utils/numberStepper";
import "./NumberStepper.css";

type NumberStepperProps = {
  id?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  variant?: "settings" | "island";
  autoFocus?: boolean;
  onChange: (value: number) => void;
};

export function NumberStepper({ id, ariaLabel, ariaLabelledBy, value, min, max, step = 1,
  variant = "settings", autoFocus, onChange }: NumberStepperProps) {
  const t = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const repeat = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const latest = useRef({ value, min, max, step, onChange, draft });
  useEffect(() => { latest.current = { value, min, max, step, onChange, draft }; }, [value, min, max, step, onChange, draft]);
  const stop = () => {
    held.current = false;
    clearTimeout(repeat.current);
  };
  useEffect(() => {
    window.addEventListener("blur", stop);
    return () => { stop(); window.removeEventListener("blur", stop); };
  }, []);

  const change = (direction: number) => {
    const state = latest.current;
    const base = parseStepperInput(state.draft ?? String(state.value), state.value, state.min, state.max);
    const next = stepStepperValue(base, direction, state.step, state.min, state.max);
    setDraft(null);
    // Keep rapid pointer repeats correct even before the parent has rendered.
    latest.current = { ...state, value: next, draft: null };
    if (next !== state.value) state.onChange(next);
    if (next === state.min || next === state.max) stop();
  };
  const commit = () => {
    const state = latest.current;
    const next = parseStepperInput(state.draft ?? String(state.value), state.value, state.min, state.max);
    latest.current = { ...state, value: next, draft: null };
    setDraft(null);
    if (next !== state.value) state.onChange(next);
  };
  const start = (event: PointerEvent<HTMLButtonElement>, direction: number) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    held.current = true;
    change(direction);
    const tick = () => {
      if (!held.current) return;
      change(direction);
      if (held.current) repeat.current = setTimeout(tick, 80);
    };
    if (held.current) repeat.current = setTimeout(tick, 400);
  };
  const button = (direction: number) => (
    <button type="button" className="number-stepper__button"
      aria-label={direction < 0 ? t.common.decrease : t.common.increase}
      disabled={direction < 0 ? value <= min : value >= max}
      onPointerDown={(event) => start(event, direction)}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onPointerLeave={stop}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom) stop();
      }}
      onBlur={stop}
      onClick={(event) => { if (event.detail === 0) change(direction); }}>
      {direction < 0 ? <Minus size={14} strokeWidth={2} /> : <Plus size={14} strokeWidth={2} />}
    </button>
  );

  return (
    <div className={`number-stepper number-stepper--${variant}`} role="group"
      aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}
      style={{ "--number-stepper-width": `${Math.max(String(max).length, String(min).length) + 0.5}ch` } as CSSProperties}>
      {button(-1)}
      <input id={id} className="number-stepper__input" type="text" inputMode="numeric" role="spinbutton"
        aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        autoFocus={autoFocus} value={draft ?? String(value)}
        onChange={(event) => { if (/^\d*$/.test(event.currentTarget.value)) setDraft(event.currentTarget.value); }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(null); }
          else if (event.key === "Enter") { event.preventDefault(); commit(); }
          else if (["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) {
            event.preventDefault();
            change((event.key === "ArrowUp" || event.key === "PageUp" ? 1 : -1) * (event.key.startsWith("Page") ? 10 : 1));
          }
        }} />
      {button(1)}
    </div>
  );
}
