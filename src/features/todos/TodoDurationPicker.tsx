import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { NumberStepper } from "../../components/NumberStepper";
import { useTranslation } from "../../i18n";
import { DEFAULT_TODO_MINUTES, MAX_TODO_MINUTES, MIN_TODO_MINUTES, type TodoDuration } from "./timer";
import "./TodoDurationPicker.css";

const PRESETS = [15, 25, 45, 60, 90] as const;

function clockAfter(minutes: number) {
  const end = new Date(Date.now() + minutes * 60_000);
  return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

/**
 * One card: the minutes in the middle, quick presets under them, then start. Presets only set
 * the time (double-click starts), so nothing begins before the big Start button.
 * Inline, inside the scrollable row: no popover can be clipped by the island.
 */
export function TodoDurationPicker({ lastDuration, onStart, onCancel }: {
  lastDuration: TodoDuration;
  onStart: (minutes: TodoDuration) => void;
  onCancel: () => void;
}) {
  const t = useTranslation();
  const [minutes, setMinutes] = useState(lastDuration ?? DEFAULT_TODO_MINUTES);
  const startButton = useRef<HTMLButtonElement>(null);
  useEffect(() => startButton.current?.focus(), []);

  return (
    <form
      className="todo-duration-picker"
      aria-label={t.todo.chooseDuration}
      onSubmit={(event) => { event.preventDefault(); onStart(minutes); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onCancel(); }
      }}
    >
      <button className="todo-duration-picker__close" type="button" aria-label={t.todo.cancelTimer} onClick={onCancel}>
        <X size={14} strokeWidth={2.2} />
      </button>
      <div className="todo-duration-picker__dial">
        <NumberStepper variant="hero" min={MIN_TODO_MINUTES} max={MAX_TODO_MINUTES} step={5}
          value={minutes} ariaLabel={t.todo.chooseDuration} onChange={setMinutes} />
        <span className="todo-duration-picker__unit">{t.todo.minutesUnit}</span>
      </div>
      <p className="todo-duration-picker__ends" aria-live="polite">{t.todo.endsAt(clockAfter(minutes))}</p>
      <div className="todo-duration-picker__presets" role="group" aria-label={t.todo.presets}>
        {PRESETS.map((preset) => (
          <button key={preset} type="button" data-minutes={preset} aria-pressed={minutes === preset}
            aria-label={t.todo.minutes(preset)}
            onClick={() => setMinutes(preset)} onDoubleClick={() => onStart(preset)}>
            {preset}
          </button>
        ))}
      </div>
      <div className="todo-duration-picker__actions">
        <button className="todo-duration-picker__unlimited" type="button" onClick={() => onStart(null)}>
          {t.todo.unlimited}
        </button>
        <button ref={startButton} className="todo-duration-picker__start" type="submit">
          <Play size={12} strokeWidth={2.6} />
          {t.todo.startFor(minutes)}
        </button>
      </div>
    </form>
  );
}
