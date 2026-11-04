import { useEffect, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { Keyboard } from "lucide-react";
import { ShortcutResetButton } from "../../components/controls/ShortcutResetButton";
import { useTranslation } from "../../i18n";
import { buildShortcutFromEvent } from "../clipboard/shortcut";
import { setTranslationSelectionShortcut, setTranslationShortcut } from "./api";
import { DEFAULT_SETTINGS, type TranslationSettings } from "./storage";
import "../clipboard/ClipboardSettingsSection.css";

export type TranslationShortcutTarget = "window" | "selection";

/**
 * The two global translation shortcuts, recorded in place. Opening the rows registers
 * the saved keys again, so one taken by another program shows its error here; one
 * taken by another row of the page (`takenBy`) is refused before it is registered.
 */
export function TranslationShortcutRows({ settings, onSettingsChange, takenBy }: {
  settings: TranslationSettings;
  onSettingsChange: Dispatch<SetStateAction<TranslationSettings>>;
  takenBy: (shortcut: string, target: TranslationShortcutTarget) => string | null;
}) {
  const t = useTranslation();
  const [recording, setRecording] = useState<TranslationShortcutTarget | null>(null);
  const [errors, setErrors] = useState<Record<TranslationShortcutTarget, string>>({ window: "", selection: "" });
  const setError = (target: TranslationShortcutTarget, error: string) => setErrors((current) => ({ ...current, [target]: error }));

  useEffect(() => {
    let didCancel = false;
    const check = (target: TranslationShortcutTarget, register: Promise<string>) => {
      void register
        .then(() => { if (!didCancel) setError(target, ""); })
        .catch((failure) => { if (!didCancel) setError(target, String(failure)); });
    };
    check("window", setTranslationShortcut(settings.shortcut));
    check("selection", setTranslationSelectionShortcut(settings.selectionShortcut));
    return () => { didCancel = true; };
    // Checks the saved keys once when the rows open; recording reports its own result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const record = (event: KeyboardEvent<HTMLButtonElement>) => {
    const target = recording;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setRecording(null); return; }
    const shortcut = buildShortcutFromEvent(event.nativeEvent);
    if (!shortcut) return;
    setRecording(null);
    apply(target, shortcut);
  };

  /** Registers new keys and saves them; refused keys keep the old ones and say why. */
  const apply = (target: TranslationShortcutTarget, shortcut: string) => {
    const owner = takenBy(shortcut, target);
    if (owner) { setError(target, t.settings.shortcuts.taken(shortcut, owner)); return; }
    const register = target === "window" ? setTranslationShortcut : setTranslationSelectionShortcut;
    void register(shortcut)
      .then((registered) => {
        onSettingsChange((current) => target === "window"
          ? { ...current, shortcut: registered }
          : { ...current, selectionShortcut: registered });
        setError(target, "");
      })
      .catch((failure) => setError(target, String(failure)));
  };

  const rows: [TranslationShortcutTarget, string, string, string][] = [
    ["window", t.settings.shortcuts.openTranslation, settings.shortcut, DEFAULT_SETTINGS.shortcut],
    ["selection", t.settings.translation.selectionShortcut, settings.selectionShortcut, DEFAULT_SETTINGS.selectionShortcut],
  ];

  return rows.map(([target, label, value, fallback]) => (
    <div className="shortcut-row" key={target}>
      <div className="shortcut-control">
        <div className="shortcut-control__meta">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        <div className="shortcut-control__actions">
          <ShortcutResetButton label={t.settings.shortcuts.reset(fallback)} isDefault={value === fallback} onReset={() => apply(target, fallback)} />
          <button
            className={`shortcut-record-button${recording === target ? " shortcut-record-button--recording" : ""}`}
            type="button"
            onClick={() => setRecording(target)}
            onKeyDown={record}
            onBlur={() => setRecording((current) => (current === target ? null : current))}
          >
            <Keyboard size={14} strokeWidth={2.3} />
            <span>{recording === target ? t.translator.pressShortcut : value}</span>
          </button>
        </div>
      </div>
      {errors[target] && <p className="shortcut-control__error" role="alert">{errors[target]}</p>}
    </div>
  ));
}
