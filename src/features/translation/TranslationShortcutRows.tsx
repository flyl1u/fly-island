import { useEffect, useState, type KeyboardEvent } from "react";
import { Keyboard } from "lucide-react";
import { useTranslation } from "../../i18n";
import { setTranslationSelectionShortcut, setTranslationShortcut } from "./api";
import { useTranslationSettings } from "./useTranslationSettings";
import "../clipboard/ClipboardSettingsSection.css";
import "./TranslationShortcutRows.css";

type Target = "window" | "selection";

function shortcutFromEvent(event: KeyboardEvent<HTMLElement>) {
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
  const modifiers = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Win"].filter(Boolean);
  if (!modifiers.length) return null;
  const key = event.key === " " || event.key === "Spacebar" ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...modifiers, key].join("+");
}

/**
 * The two global translation shortcuts, recorded in place. Opening the rows registers
 * the saved keys again, so one taken by another program shows its error here.
 */
export function TranslationShortcutRows() {
  const t = useTranslation();
  const [settings, setSettings] = useTranslationSettings();
  const [recording, setRecording] = useState<Target | null>(null);
  const [errors, setErrors] = useState<Record<Target, string>>({ window: "", selection: "" });

  useEffect(() => {
    let didCancel = false;
    const check = (target: Target, register: Promise<string>) => {
      void register
        .then(() => { if (!didCancel) setErrors((current) => ({ ...current, [target]: "" })); })
        .catch((failure) => { if (!didCancel) setErrors((current) => ({ ...current, [target]: String(failure) })); });
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
    const register = target === "window" ? setTranslationShortcut : setTranslationSelectionShortcut;
    void register(shortcut)
      .then((registered) => {
        setSettings((current) => target === "window"
          ? { ...current, shortcut: registered }
          : { ...current, selectionShortcut: registered });
        setErrors((current) => ({ ...current, [target]: "" }));
        setRecording(null);
      })
      .catch((failure) => setErrors((current) => ({ ...current, [target]: String(failure) })));
  };

  const rows: [Target, string, string][] = [
    ["window", t.settings.shortcuts.openTranslation, settings.shortcut],
    ["selection", t.settings.translation.selectionShortcut, settings.selectionShortcut],
  ];

  return rows.map(([target, label, value]) => (
    <div className="translation-shortcut" key={target}>
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
      {errors[target] && <p className="translation-shortcut__error" role="alert">{errors[target]}</p>}
    </div>
  ));
}
