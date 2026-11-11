import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ShortcutResetButton } from "../../components/controls/ShortcutResetButton";
import { ShortcutRecordButton } from "../../components/controls/ShortcutRecordButton";
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
  const [error, setError] = useState("");

  useEffect(() => {
    let didCancel = false;
    void setTranslationShortcut(settings.shortcut)
      .then(() => { if (!didCancel) setError(""); })
      .catch((failure) => {
        console.warn("Translation shortcut not registered:", failure);
        if (!didCancel) setError(t.settings.shortcuts.registerFailed(settings.shortcut));
      });
    return () => { didCancel = true; };
    // Checks the saved keys once when the row opens; recording reports its own result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Registers new keys and saves them. Keys Windows refuses keep the old ones, which
   * the native side registers again, and the row says so.
   */
  const apply = (shortcut: string) => {
    const owner = takenBy(shortcut);
    if (owner) { setError(t.settings.shortcuts.taken(shortcut, owner)); return; }
    void setTranslationShortcut(shortcut)
      .then((registered) => {
        onSettingsChange((current) => ({ ...current, shortcut: registered }));
        setError("");
      })
      .catch((failure) => {
        console.warn("Translation shortcut not registered:", failure);
        setError(t.settings.shortcuts.registerFailed(shortcut, settings.shortcut));
      });
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
          <ShortcutRecordButton
            shortcut={settings.shortcut}
            pressKeysLabel={t.translator.pressShortcut}
            toShortcut={buildShortcutFromEvent}
            onRecord={apply}
          />
        </div>
      </div>
      {error && <p className="shortcut-control__error" role="alert">{error}</p>}
    </div>
  );
}
