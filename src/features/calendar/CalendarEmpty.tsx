import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { useTranslation } from "../../i18n";
import { getErrorMessage } from "../../utils/error";
import { addChinaHolidays } from "./holidays";

/**
 * The calendar page before any calendar is added: what it is for, a one-click subscription to
 * China's holidays (no account), and the way to Settings for a work calendar.
 */
export function CalendarEmpty({ onAdded, onOpenSettings }: { onAdded: () => void; onOpenSettings: () => void }) {
  const t = useTranslation();
  const text = t.calendar;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const subscribe = async () => {
    setBusy(true);
    setError("");
    try {
      await addChinaHolidays(t.settings.calendar.holidaysName);
      onAdded();
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="calendar-empty">
      <CalendarPlus className="calendar-empty__icon" size={26} strokeWidth={1.8} aria-hidden="true" />
      <strong>{text.emptyTitle}</strong>
      <span className="calendar-empty__hint">{text.emptyHint}</span>
      <div className="calendar-empty__actions">
        <button className="calendar-empty__primary" type="button" disabled={busy} onClick={() => void subscribe()}>
          {busy ? text.adding : text.addHolidays}
        </button>
        <button className="calendar-empty__secondary" type="button" onClick={onOpenSettings}>
          {text.addWork}
        </button>
      </div>
      {error && (
        <span className="calendar-empty__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
