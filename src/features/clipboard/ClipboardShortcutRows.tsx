import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Keyboard } from "lucide-react";
import { useTranslation } from "../../i18n";
import { ShortcutResetButton } from "../../components/controls/ShortcutResetButton";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { getClipboardShortcutError, listenClipboardShortcutStatus, type ClipboardHistorySettings } from "./api";
import { buildShortcutFromEvent, DEFAULT_CLIPBOARD_SHORTCUT, normalizeClipboardShortcut } from "./shortcut";
import "./ClipboardSettingsSection.css";

/**
 * The global shortcut that opens clipboard history: its switch and the recorded keys.
 * Registration happens in the background service, which reports a failure afterwards;
 * keys taken by another row of the page (`takenBy`) are refused before saving.
 */
export function ClipboardShortcutRows({ clipboardSettings, onClipboardSettingsChange, takenBy }: {
  clipboardSettings: ClipboardHistorySettings;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
  takenBy: (shortcut: string) => string | null;
}) {
  const t = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [conflict, setConflict] = useState("");
  const shortcut = normalizeClipboardShortcut(clipboardSettings.shortcut);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;
    void getClipboardShortcutError()
      .then((error) => { if (!didCancel) setRegisterError(error ?? ""); })
      .catch(() => {});
    void listenClipboardShortcutStatus((error) => setRegisterError(error ?? ""))
      .then((nextUnlisten) => { if (didCancel) nextUnlisten(); else unlisten = nextUnlisten; });
    return () => { didCancel = true; unlisten?.(); };
  }, []);

  const record = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!isRecording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setIsRecording(false); return; }
    const next = buildShortcutFromEvent(event.nativeEvent);
    if (!next) return;
    setIsRecording(false);
    apply(next);
  };

  /** Saves new keys for the service to register; keys another row uses are refused. */
  const apply = (next: string) => {
    const owner = takenBy(next);
    setConflict(owner ? t.settings.shortcuts.taken(next, owner) : "");
    if (!owner) onClipboardSettingsChange({ ...clipboardSettings, shortcut: next });
  };

  const error = clipboardSettings.shortcutEnabled ? conflict || registerError : "";

  return (
    <>
      <ToggleControl
        label={t.settings.clipboard.shortcutEnabled}
        checked={clipboardSettings.shortcutEnabled}
        onChange={(shortcutEnabled) => onClipboardSettingsChange({ ...clipboardSettings, shortcutEnabled })}
      />
      <div className="shortcut-row">
        <div className={`shortcut-control${clipboardSettings.shortcutEnabled ? "" : " shortcut-control--disabled"}`}>
          <div className="shortcut-control__meta">
            <span>{t.settings.clipboard.shortcut}</span>
            <strong>{shortcut}</strong>
          </div>
          <div className="shortcut-control__actions">
            <ShortcutResetButton
              label={t.settings.shortcuts.reset(DEFAULT_CLIPBOARD_SHORTCUT)}
              isDefault={shortcut === DEFAULT_CLIPBOARD_SHORTCUT}
              disabled={!clipboardSettings.shortcutEnabled}
              onReset={() => apply(DEFAULT_CLIPBOARD_SHORTCUT)}
            />
            <button
              className={`shortcut-record-button${isRecording ? " shortcut-record-button--recording" : ""}`}
              type="button"
              disabled={!clipboardSettings.shortcutEnabled}
              onClick={() => setIsRecording(true)}
              onKeyDown={record}
              onBlur={() => setIsRecording(false)}
            >
              <Keyboard size={14} strokeWidth={2.3} />
              <span>{isRecording ? t.settings.clipboard.pressKeys : shortcut}</span>
            </button>
          </div>
        </div>
        {error && <p className="shortcut-control__error" role="alert">{error}</p>}
      </div>
    </>
  );
}
