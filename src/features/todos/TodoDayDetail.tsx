import { useId, useMemo, type ReactNode } from "react";
import { useTranslation } from "../../i18n";
import { dayHeading, relativeDay } from "./calendar";
import "./TodoDayDetail.css";

/** The dated list shown beside the calendar. */
export function TodoDayDetail({
  date,
  today,
  calendarNote,
  summary,
  composer,
  children,
}: {
  date: string;
  today: string;
  calendarNote?: string;
  summary?: string;
  composer?: ReactNode;
  children: ReactNode[];
}) {
  const t = useTranslation();
  const titleId = useId();
  const formats = useMemo(() => ({
    date: new Intl.DateTimeFormat(t.localeTag, { year: "numeric", month: "short", day: "numeric" }),
    weekday: new Intl.DateTimeFormat(t.localeTag, { weekday: "short" }),
  }), [t.localeTag]);
  const parsed = new Date(`${date}T00:00:00`);
  const valid = !Number.isNaN(parsed.getTime());
  const dateLabel = valid ? formats.date.format(parsed) : date;
  const weekday = valid ? formats.weekday.format(parsed) : "";
  const relative = relativeDay(date, today);
  const hasTodos = children.length > 0;

  return (
    <section className="todo-day-detail" aria-labelledby={titleId} data-date={date}>
      <header className="todo-day-detail__header" aria-live="polite">
        <div>
          <h3 className="todo-day-detail__title" id={titleId}>
            {relative ? dayHeading(date, today, t.notebook) : <time dateTime={date}>{dateLabel}</time>}
          </h3>
          {(relative || weekday || calendarNote) && (
            <p className="todo-day-detail__meta">
              {relative && <time dateTime={date}>{dateLabel}</time>}
              {weekday && <span>{weekday}</span>}
              {calendarNote && <span className="todo-day-detail__calendar-note">{calendarNote}</span>}
            </p>
          )}
        </div>
        {summary && <span className="todo-day-detail__summary">{summary}</span>}
      </header>
      {composer}
      <div
        key={date}
        className="todo-day-detail__body"
        role={hasTodos ? "list" : undefined}
        aria-labelledby={hasTodos ? titleId : undefined}
      >
        {hasTodos ? children : <p className="todo-day-detail__empty">{t.notebook.noTodosOnDay}</p>}
      </div>
    </section>
  );
}
