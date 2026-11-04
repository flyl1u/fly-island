import { useEffect, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { Keyboard } from "lucide-react";
import { useTranslation } from "../../i18n";
import { setTranslationSelectionShortcut, setTranslationShortcut } from "./api";
import type { TranslationSettings } from "./storage";
import "../clipboard/ClipboardSettingsSection.css";

export type TranslationShortcutTarget = "window" | "selection";

function shortcutFromEvent(event: KeyboardEvent<HTMLElement>) {
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
  const modifiers = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Win"].filter(Boolean);
  if (!modifiers.length) return null;
  const key = event.key === " " || event.key === "Spacebar" ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...modifiers, key].join("+");
}

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
    const shortcut = shortcutFromEvent(event);
    if (!shortcut) return;
    const owner = takenBy(shortcut, target);
    if (owner) { setError(target, t.settings.shortcuts.taken(shortcut, owner)); setRecording(null); return; }
    const register = target === "window" ? setTranslationShortcut : setTranslationSelectionShortcut;
    void register(shortcut)
      .then((registered) => {
        onSettingsChange((current) => target === "window"
          ? { ...current, shortcut: registered }
          : { ...current, selectionShortcut: registered });
        setError(target, "");
        setRecording(null);
      })
      .catch((failure) => setError(target, String(failure)));
  };

  const rows: [TranslationShortcutTarget, string, string][] = [
    ["window", t.settings.shortcuts.openTranslation, settings.shortcut],
    ["selection", t.settings.translation.selectionShortcut, settings.selectionShortcut],
  ];

  return rows.map(([target, label, value]) => (
    <div className="shortcut-row" key={target}>
      <div className="shortcut-control">
        <div className="shortcut-control__meta">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
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
      {errors[target] && <p className="shortcut-control__error" role="alert">{errors[target]}</p>}
    </div>
  ));
}
