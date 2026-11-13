import { NumberStepper } from "../../components/NumberStepper";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import { MAX_TODO_MINUTES, MIN_TODO_MINUTES, parseTodoMinutes, type TodoDuration } from "./timer";
import "./TodoDurationPicker.css";

const PRESETS = [15, 30, 60] as const;

/** Inline, inside the scrollable row: no popover can be clipped by the island. */
export function TodoDurationPicker({ lastDuration, onStart, onCancel }: {
  lastDuration: TodoDuration;
  onStart: (minutes: TodoDuration) => void;
  onCancel: () => void;
}) {
  const t = useTranslation();
  const [custom, setCustom] = useState(lastDuration !== null && !PRESETS.some((minutes) => minutes === lastDuration));
  const [draft, setDraft] = useState(String(lastDuration ?? 25));
  const group = useRef<HTMLDivElement>(null);
  const minutes = parseTodoMinutes(draft);
  useEffect(() => {
    const element = group.current;
    (element?.querySelector<HTMLElement>("input")
      ?? element?.querySelector<HTMLElement>('button[aria-pressed="true"]')
      ?? element?.querySelector<HTMLElement>("button"))?.focus();
  }, []);

  return (
    <div ref={group} className="todo-duration-picker" role="group" aria-label={t.todo.chooseDuration}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onCancel(); }
      }}>
      <div className="todo-duration-picker__options">
        {PRESETS.map((duration) => (
          <button key={duration} type="button" aria-pressed={lastDuration === duration && !custom}
            onClick={() => onStart(duration)}>{duration === 60 ? t.todo.oneHour : t.todo.minutes(duration)}</button>
        ))}
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>{t.todo.customDuration}</button>
        <button type="button" aria-pressed={lastDuration === null && !custom} onClick={() => onStart(null)}>{t.todo.unlimited}</button>
        <button className="todo-duration-picker__cancel" type="button" onClick={onCancel}>{t.todo.cancelTimer}</button>
      </div>
      {custom && (
        <form className="todo-duration-picker__custom" onSubmit={(event) => {
          event.preventDefault();
          if (minutes !== null) onStart(minutes);
        }}>
          <div className="todo-duration-picker__label">
            {t.todo.customMinutes}
            <NumberStepper autoFocus variant="island" min={MIN_TODO_MINUTES} max={MAX_TODO_MINUTES} step={5}
              value={minutes ?? 25} ariaLabel={t.todo.customMinutes} onChange={(value) => setDraft(String(value))} />
          </div>
          <button type="submit" disabled={minutes === null}>{t.todo.start}</button>
          {minutes === null && <span role="status">{t.todo.durationRange}</span>}
        </form>
      )}
    </div>
  );
}
