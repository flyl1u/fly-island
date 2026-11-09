import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "../../i18n";
import "./ResetAppearanceButton.css";

// An unanswered confirmation falls back so a stray click later cannot reset.
const CONFIRM_TIMEOUT_MS = 4_000;

/** Resets the appearance after an inline confirmation step. */
export function ResetAppearanceButton({ onReset }: { onReset: () => void }) {
  const t = useTranslation();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) {
      return;
    }

    const timeout = window.setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        className="appearance-reset"
        type="button"
        onClick={() => setConfirming(true)}
      >
        <RotateCcw size={13} strokeWidth={2.4} aria-hidden="true" />
        <span>{t.settings.resetAppearance.label}</span>
      </button>
    );
  }

  return (
    <div className="appearance-reset__confirm" role="group" aria-label={t.settings.resetAppearance.hint}>
      <button
        className="appearance-reset appearance-reset--danger"
        type="button"
        autoFocus
        onClick={() => {
          setConfirming(false);
          onReset();
        }}
      >
        <span>{t.settings.resetAppearance.confirm}</span>
      </button>
      <button className="appearance-reset" type="button" onClick={() => setConfirming(false)}>
        <span>{t.settings.resetAppearance.cancel}</span>
      </button>
    </div>
  );
}
