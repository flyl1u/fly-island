import { useEffect, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { Keyboard } from "lucide-react";
import { ShortcutResetButton } from "../../components/controls/ShortcutResetButton";
import { useTranslation } from "../../i18n";
import { buildShortcutFromEvent } from "../clipboard/shortcut";
import { setTranslationShortcut } from "./api";
import { DEFAULT_SETTINGS, type TranslationSettings } from "./storage";
import "../clipboard/ClipboardSettingsSection.css";

/**
 * The global shortcut that opens translation, recorded in place. Opening the row
 * registers the saved keys again, so keys taken by another program show their error
 * here; keys taken by another island shortcut (`takenBy`) are refused before they
 * are registered.
 */
export function TranslationShortcutRows({ settings, onSettingsChange, takenBy }: {
  settings: TranslationSettings;
  onSettingsChange: Dispatch<SetStateAction<TranslationSettings>>;
  takenBy: (shortcut: string) => string | null;
}) {
  const t = useTranslation();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let didCancel = false;
    void setTranslationShortcut(settings.shortcut)
      .then(() => { if (!didCancel) setError(""); })
      .catch((failure) => { if (!didCancel) setError(String(failure)); });
    return () => { didCancel = true; };
    // Checks the saved keys once when the row opens; recording reports its own result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Registers new keys and saves them; refused keys keep the old ones and say why. */
  const apply = (shortcut: string) => {
    const owner = takenBy(shortcut);
    if (owner) { setError(t.settings.shortcuts.taken(shortcut, owner)); return; }
    void setTranslationShortcut(shortcut)
      .then((registered) => {
        onSettingsChange((current) => ({ ...current, shortcut: registered }));
        setError("");
      })
      .catch((failure) => setError(String(failure)));
  };

  const record = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setRecording(false); return; }
    const shortcut = buildShortcutFromEvent(event.nativeEvent);
    if (!shortcut) return;
    setRecording(false);
    apply(shortcut);
  };

  const fallback = DEFAULT_SETTINGS.shortcut;
  return (
    <div className="shortcut-row">
      <div className="shortcut-control">
        <div className="shortcut-control__meta">
          <span>{t.settings.shortcuts.openTranslation}</span>
          <strong>{settings.shortcut}</strong>
        </div>
        <div className="shortcut-control__actions">
          <ShortcutResetButton label={t.settings.shortcuts.reset(fallback)} isDefault={settings.shortcut === fallback} onReset={() => apply(fallback)} />
          <button
            className={`shortcut-record-button${recording ? " shortcut-record-button--recording" : ""}`}
            type="button"
            onClick={() => setRecording(true)}
            onKeyDown={record}
            onBlur={() => setRecording(false)}
          >
            <Keyboard size={14} strokeWidth={2.3} />
            <span>{recording ? t.translator.pressShortcut : settings.shortcut}</span>
          </button>
        </div>
      </div>
      {error && <p className="shortcut-control__error" role="alert">{error}</p>}
    </div>
  );
}
