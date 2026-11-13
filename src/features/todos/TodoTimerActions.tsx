import { useTranslation } from "../../i18n";
import "./TodoTimerActions.css";

export function TodoTimerActions({ onComplete, onRepeat }: { onComplete: () => void; onRepeat: () => void }) {
  const t = useTranslation();
  return (
    <div className="todo-timer-actions">
      <span role="status">{t.todo.timeUp}</span>
      <button type="button" onClick={onComplete}>{t.todo.complete}</button>
      <button type="button" onClick={onRepeat}>{t.todo.repeatTimer}</button>
    </div>
  );
}
