import { useId, useMemo, type ReactNode } from "react";
import { useTranslation } from "../../i18n";
import { dayHeading, relativeDay } from "./history";
import "./TodoDayDetail.css";

/** The dated list shown beside either date navigator. */
export function TodoDayDetail({
  date,
  today,
  summary,
  composer,
  children,
}: {
  date: string;
  today: string;
  summary?: string;
  composer?: ReactNode;
  children: ReactNode[];
}) {
  const t = useTranslation();
  const titleId = useId();
  const format = useMemo(() => new Intl.DateTimeFormat(t.localeTag, {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }), [t.localeTag]);
  const parsed = new Date(`${date}T00:00:00`);
  const fullDate = Number.isNaN(parsed.getTime()) ? date : format.format(parsed);
  const relative = relativeDay(date, today);
  const hasTodos = children.length > 0;

  return (
    <section className="todo-day-detail" aria-labelledby={titleId} data-date={date}>
      <header className="todo-day-detail__header" aria-live="polite">
        <div>
          <h3 className="todo-day-detail__title" id={titleId}>
            {relative ? dayHeading(date, today, t.notebook) : <time dateTime={date}>{fullDate}</time>}
          </h3>
          {relative && <time className="todo-day-detail__date" dateTime={date}>{fullDate}</time>}
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
