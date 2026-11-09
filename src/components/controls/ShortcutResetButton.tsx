import { RotateCcw } from "lucide-react";
import "./ShortcutResetButton.css";

/**
 * Puts a recorded shortcut back to its default. It keeps its space while the default
 * is in use, so the record buttons of a list stay lined up.
 */
export function ShortcutResetButton({ label, isDefault, disabled, onReset }: {
  label: string;
  isDefault: boolean;
  disabled?: boolean;
  onReset: () => void;
}) {
  return (
    <button
      className={`shortcut-reset-button${isDefault ? " shortcut-reset-button--hidden" : ""}`}
      type="button"
      aria-label={label}
      aria-hidden={isDefault || undefined}
      tabIndex={isDefault ? -1 : undefined}
      disabled={isDefault || disabled}
      onClick={onReset}
    >
      <RotateCcw size={13} strokeWidth={2.3} aria-hidden="true" />
    </button>
  );
}
