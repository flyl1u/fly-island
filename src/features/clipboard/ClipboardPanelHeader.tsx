import { Check, ClipboardList, Keyboard, Star, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { normalizeClipboardShortcut } from "./shortcut";
import "./ClipboardPanelHeader.css";

export function ClipboardPanelHeader({
  itemCount,
  favoriteCount,
  shortcutEnabled,
  shortcut,
  isConfirmingClear,
  onClear,
}: {
  itemCount: number;
  favoriteCount: number;
  shortcutEnabled: boolean;
  shortcut: string;
  isConfirmingClear: boolean;
  onClear: () => void;
}) {
  const t = useTranslation();

  return (
    <header className="clipboard-panel__header">
      <div className="clipboard-panel__title">
        <ClipboardList size={16} strokeWidth={2.2} />
        <span>{t.clipboard.title}</span>
        <strong>{itemCount}</strong>
        {favoriteCount > 0 && (
          <em aria-label={t.clipboard.favoriteCount(favoriteCount)}>
            <Star size={10} strokeWidth={2.4} fill="currentColor" />
            {favoriteCount}
          </em>
        )}
      </div>
      <div className="clipboard-panel__tools">
        {shortcutEnabled ? (
          <span
            className="clipboard-shortcut-display"
            aria-label={t.clipboard.expandShortcut}
          >
            <Keyboard size={14} strokeWidth={2.3} />
            <span>{normalizeClipboardShortcut(shortcut)}</span>
          </span>
        ) : null}
        <button
          className={[
            "clipboard-clear-button",
            isConfirmingClear ? "clipboard-clear-button--confirming" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          disabled={itemCount === 0}
          aria-label={
            isConfirmingClear ? t.clipboard.confirmClear : t.clipboard.clearHistory
          }
          onClick={onClear}
          data-clipboard-confirm-control="true"
        >
          {isConfirmingClear ? (
            <Check className="save-check-icon" size={14} strokeWidth={2.7} />
          ) : (
            <Trash2 size={14} strokeWidth={2.2} />
          )}
        </button>
      </div>
    </header>
  );
}
