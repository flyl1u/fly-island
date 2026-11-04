import { useRef } from "react";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "../../i18n";
import { addDays } from "./schedule";
import "./TodoDatePicker.css";

/** Picks the day a new todo is for; a later day schedules it instead of adding it now. */
export function TodoDatePicker({
  value,
  today,
  disabled,
  onChange,
}: {
  /** Chosen day (YYYY-MM-DD), or null for the list's own day. */
  value: string | null;
  today: string;
  disabled: boolean;
  onChange: (date: string | null) => void;
}) {
  const t = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const isLater = value !== null && value > today;
  const label = !isLater
    ? t.notebook.dateToday
    : value === addDays(today, 1)
      ? t.notebook.dateTomorrow
      : new Intl.DateTimeFormat(t.localeTag, { month: "numeric", day: "numeric" }).format(
          new Date(`${value}T00:00:00`),
        );

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  return (
    <span className="todo-date-picker">
      <button
        className={`todo-date-picker__button${isLater ? " todo-date-picker__button--later" : ""}`}
        type="button"
        disabled={disabled}
        title={t.notebook.pickDate}
        aria-label={`${t.notebook.pickDate}: ${label}`}
        onClick={openPicker}
      >
        <CalendarDays size={13} strokeWidth={2.2} aria-hidden="true" />
        <span>{label}</span>
      </button>
      <input
        ref={inputRef}
        className="todo-date-picker__input"
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={today}
        value={isLater ? value : today}
        onChange={(event) => {
          const next = event.currentTarget.value;
          onChange(next && next > today ? next : null);
        }}
      />
    </span>
  );
}
