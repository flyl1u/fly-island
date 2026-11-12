import { useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ClipboardList, History, NotebookPen, type LucideIcon } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { TodoPageMode } from "./types";
import "./TodoViewSwitch.css";

export type TodoView = "today" | "daily" | "history" | "calendar";

/** The segment a page belongs to: the upcoming list hangs off Todos, archived days off History. */
export function todoViewOf(pageMode: TodoPageMode): TodoView {
  if (pageMode === "daily" || pageMode === "calendar") return pageMode;
  if (pageMode === "history" || pageMode === "archive" || pageMode === "review") return "history";
  return "today";
}

const ICONS: Record<TodoView, LucideIcon> = {
  today: ClipboardList,
  daily: NotebookPen,
  history: History,
  calendar: CalendarDays,
};
const VIEWS: TodoView[] = ["today", "daily", "history", "calendar"];

/**
 * Todos / Notes / History / Calendar as one segmented control. Only the active segment shows
 * its label, so the control stays narrow; a pill slides under it.
 */
export function TodoViewSwitch({ pageMode, onSelect }: { pageMode: TodoPageMode; onSelect: (view: TodoView) => void }) {
  const t = useTranslation();
  const active = todoViewOf(pageMode);
  const labels: Record<TodoView, string> = {
    today: t.notebook.tasksTab,
    daily: t.notebook.dailyTab,
    history: t.notebook.historyTab,
    calendar: t.notebook.calendarTab,
  };
  const activeLabel = labels[active];
  const buttons = useRef(new Map<TodoView, HTMLButtonElement>());
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // The first placement jumps; later ones slide.
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const button = buttons.current.get(active);
    if (button) setPill({ left: button.offsetLeft, width: button.offsetWidth });
  }, [active, activeLabel]);

  useLayoutEffect(() => {
    if (!pill || ready) return;
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [pill, ready]);

  return (
    <div className={`todo-view-switch${ready ? " todo-view-switch--ready" : ""}`} role="tablist" aria-label={t.notebook.sectionLabel}>
      {pill && (
        <span
          className="todo-view-switch__pill"
          aria-hidden="true"
          style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
        />
      )}
      {VIEWS.map((view) => {
        const Icon = ICONS[view];
        const selected = view === active;
        return (
          <button
            key={view}
            ref={(element) => {
              if (element) buttons.current.set(view, element);
              else buttons.current.delete(view);
            }}
            className={`todo-view-switch__segment${selected ? " todo-view-switch__segment--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={labels[view]}
            data-view={view}
            onClick={() => onSelect(view)}
          >
            <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
            {selected && <span>{labels[view]}</span>}
          </button>
        );
      })}
    </div>
  );
}
