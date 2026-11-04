import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Keyboard } from "lucide-react";
import { useTranslation } from "../../i18n";
import { ToggleControl } from "../../components/controls/ToggleControl";
import type { ClipboardHistorySettings } from "./api";
import { buildShortcutFromEvent, normalizeClipboardShortcut } from "./shortcut";
import "./ClipboardSettingsSection.css";

/** The global shortcut that opens clipboard history: its switch and the recorded keys. */
export function ClipboardShortcutRows({ clipboardSettings, onClipboardSettingsChange }: {
  clipboardSettings: ClipboardHistorySettings;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
}) {
  const t = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const shortcut = normalizeClipboardShortcut(clipboardSettings.shortcut);

  const record = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!isRecording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setIsRecording(false); return; }
    const next = buildShortcutFromEvent(event.nativeEvent);
    if (!next) return;
    onClipboardSettingsChange({ ...clipboardSettings, shortcut: next });
    setIsRecording(false);
  };

  return (
    <>
      <ToggleControl
        label={t.settings.clipboard.shortcutEnabled}
        checked={clipboardSettings.shortcutEnabled}
        onChange={(shortcutEnabled) => onClipboardSettingsChange({ ...clipboardSettings, shortcutEnabled })}
      />
      <div className={`shortcut-control${clipboardSettings.shortcutEnabled ? "" : " shortcut-control--disabled"}`}>
        <div className="shortcut-control__meta">
          <span>{t.settings.clipboard.shortcut}</span>
          <strong>{shortcut}</strong>
        </div>
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
    </>
  );
}
