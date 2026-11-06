import { useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../../i18n";
import { takeTodoStoreNotice } from "./todoStore";
import "./TodoDataNotice.css";

/** Tells the user, once per start, that the todo data migration failed or re-imported older data. */
export function TodoDataNotice() {
  const t = useTranslation();
  const [notice, setNotice] = useState(takeTodoStoreNotice);
  if (!notice) return null;

  return (
    <div className="todo-data-notice" role="status">
      <span>{t.notebook.dataNotice[notice]}</span>
      <button type="button" aria-label={t.notebook.dismissNotice} onClick={() => setNotice(null)}>
        <X size={12} strokeWidth={2.4} />
      </button>
    </div>
  );
}
