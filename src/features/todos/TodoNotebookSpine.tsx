import { Check } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { SaveState, TodoPageMode } from "./types";
import "./TodoNotebookSpine.css";

export function TodoNotebookSpine({
  pageMode,
  saveState,
  onShowToday,
  onSaveToday,
  onShowArchive,
}: {
  pageMode: TodoPageMode;
  saveState: SaveState;
  onShowToday: () => void;
  onSaveToday: () => void;
  onShowArchive: () => void;
}) {
  const t = useTranslation();
  const isTodayMode = pageMode === "today";
  // The daily note and the upcoming list belong to today's group of pages.
  const isDailyMode = pageMode === "daily" || pageMode === "upcoming";

  return (
    <div className="todo-notebook__spine">
      <button
        className={[
          "todo-spine-button",
          "todo-spine-button--today",
          isTodayMode || isDailyMode ? "todo-spine-button--active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        type="button"
        title={t.notebook.backToToday}
        aria-label={t.notebook.backToToday}
        onClick={onShowToday}
      />
      <button
        className={[
          "todo-spine-button",
          "todo-spine-button--save",
          saveState === "saved" ? "todo-spine-button--saved" : "",
          saveState === "saving" ? "todo-spine-button--saving" : "",
          saveState === "needs-path" || saveState === "error"
            ? "todo-spine-button--attention"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        type="button"
        title={t.notebook.saveToday}
        aria-label={t.notebook.saveTodayMarkdown}
        onClick={onSaveToday}
      >
        {saveState === "saved" && (
          <Check className="save-check-icon" size={12} strokeWidth={3} />
        )}
      </button>
      <button
        className={[
          "todo-spine-button",
          "todo-spine-button--archive",
          pageMode === "archive" || pageMode === "review"
            ? "todo-spine-button--active"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        type="button"
        title={t.notebook.reviewSaved}
        aria-label={t.notebook.reviewSaved}
        onClick={onShowArchive}
      />
    </div>
  );
}
