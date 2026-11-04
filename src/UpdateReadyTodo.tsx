import { useSyncExternalStore } from "react";
import { RefreshCcw, X } from "lucide-react";
import { useTranslation } from "./i18n";
import {
  dismissUpdatePrompt,
  getUpdateState,
  installUpdate,
  subscribeToUpdate,
} from "./updaterController";

/**
 * A downloaded update is surfaced as a row inside the island's todo list
 * instead of a separate floating popup, so it reads like a pending task and
 * stays put while the user switches pages.
 */
export function UpdateReadyTodo() {
  const t = useTranslation();
  const { stage, nextVersion, dismissed } = useSyncExternalStore(
    subscribeToUpdate,
    getUpdateState,
  );

  if (stage !== "ready" || dismissed) return null;

  return (
    <div className="todo-item todo-update" role="listitem" aria-live="polite">
      <RefreshCcw
        className="todo-update__icon"
        size={16}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="todo-update__copy">
        <strong>{t.settings.project.update.ready(nextVersion)}</strong>
        <span>{t.settings.project.update.readyHint}</span>
      </span>
      <button
        className="todo-update__restart"
        type="button"
        onClick={() => void installUpdate()}
      >
        {t.settings.project.update.restart}
      </button>
      <button
        className="todo-update__dismiss"
        type="button"
        aria-label={t.settings.project.update.later}
        title={t.settings.project.update.later}
        onClick={dismissUpdatePrompt}
      >
        <X size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}
