import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "../../i18n";
import { monthOf, shiftMonth } from "./calendar";
import { movePickerFocus, pickerMonthGrid, pickerWeekStart, shiftPickerMonth } from "./datePickerCalendar";
import "./TodoDatePopover.css";

/** A calendar drawn inside the todo panel, so WebView2 keeps both focus and stacking order. */
export function TodoDatePopover({ id, value, today, onSelect, onClose }: {
  id: string;
  value: string | null;
  today: string;
  onSelect: (date: string | null) => void;
  onClose: () => void;
}) {
  const t = useTranslation();
  const initial = value && value >= today ? value : today;
  const [month, setMonth] = useState(monthOf(initial));
  const [focused, setFocused] = useState(initial);
  const focusRequested = useRef(true);
  const popup = useRef<HTMLDivElement>(null);
  const weekStart = pickerWeekStart(t.localeTag);
  const dates = useMemo(() => pickerMonthGrid(month, weekStart), [month, weekStart]);
  const formats = useMemo(() => ({
    month: new Intl.DateTimeFormat(t.localeTag, { month: "short", year: "numeric" }),
    weekday: new Intl.DateTimeFormat(t.localeTag, { weekday: "narrow" }),
    day: new Intl.DateTimeFormat(t.localeTag, { dateStyle: "full" }),
  }), [t.localeTag]);
  const toDate = (date: string) => new Date(`${date}T00:00:00`);

  useLayoutEffect(() => {
    if (!focusRequested.current) return;
    popup.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus({ preventScroll: true });
    focusRequested.current = false;
  }, [focused, month]);

  const moveMonth = (delta: number) => {
    setMonth(shiftMonth(month, delta));
    setFocused(shiftPickerMonth(focused, delta));
  };
  const select = (date: string | null) => { onSelect(date && date > today ? date : null); onClose(); };

  return (
    <div ref={popup} id={id} className="todo-date-popover" role="dialog" aria-label={t.notebook.pickDate}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      }}>
      <div className="todo-date-popover__nav">
        <button type="button" aria-label={t.notebook.previousMonth} onClick={() => moveMonth(-1)}>
          <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <span aria-live="polite">{formats.month.format(toDate(`${month}-01`))}</span>
        <button type="button" aria-label={t.notebook.nextMonth} onClick={() => moveMonth(1)}>
          <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <div className="todo-date-popover__grid" role="grid" aria-label={formats.month.format(toDate(`${month}-01`))}
        onKeyDown={(event) => {
          const date = (event.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset.date;
          if (!date) return;
          const next = movePickerFocus(date, event.key, weekStart, today);
          if (next === null) return;
          event.preventDefault();
          event.stopPropagation();
          focusRequested.current = true;
          setFocused(next);
          setMonth(monthOf(next));
        }}>
        <div className="todo-date-popover__week" role="row">
          {dates.slice(0, 7).map(date => <span role="columnheader" key={date}>{formats.weekday.format(toDate(date))}</span>)}
        </div>
        {Array.from({ length: dates.length / 7 }, (_, week) => (
          <div className="todo-date-popover__week" role="row" key={week}>
            {dates.slice(week * 7, week * 7 + 7).map(date => (
              <div role="gridcell" key={date} aria-selected={date === initial}>
                <button type="button" data-date={date} tabIndex={date === focused ? 0 : -1}
                  disabled={date < today} aria-label={formats.day.format(toDate(date))}
                  aria-current={date === today ? "date" : undefined} aria-pressed={date === initial}
                  className={`todo-date-popover__day${monthOf(date) !== month ? " todo-date-popover__day--outside" : ""}`}
                  onFocus={() => setFocused(date)} onClick={() => select(date)}>
                  {Number(date.slice(8))}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="todo-date-popover__footer">
        <button type="button" onClick={() => select(today)}>{t.notebook.dateToday}</button>
        <button type="button" onClick={() => select(null)}>{t.notebook.clearDate}</button>
      </div>
    </div>
  );
}
