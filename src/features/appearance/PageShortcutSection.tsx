import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Keyboard } from "lucide-react";
import { ShortcutResetButton } from "../../components/controls/ShortcutResetButton";
import { useTranslation } from "../../i18n";
import { buildShortcutFromEvent } from "../clipboard/shortcut.ts";
import "../clipboard/ClipboardSettingsSection.css";
import {
  digitModifiersFromEvent,
  normalizePageCycleShortcut,
  normalizePageDigitModifiers,
  recordedPageCycleShortcut,
  DEFAULT_PAGE_DIGIT_MODIFIERS,
  DEFAULT_PAGE_NEXT_SHORTCUT,
  DEFAULT_PAGE_PREVIOUS_SHORTCUT,
} from "./pageShortcuts.ts";
import type { IslandSettings } from "./types";
import "./PageShortcutSection.css";

type Recording = "digit" | "next" | "previous";

/**
 * Shortcuts for moving between expanded island pages. Keys that another shortcut
 * already uses (`takenBy`, given the row's id) are refused with a message.
 */
export function PageShortcutSection({
  settings,
  onSettingsChange,
  takenBy,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  takenBy: (shortcut: string, selfId: Recording) => string | null;
}) {
  const t = useTranslation();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [conflict, setConflict] = useState("");
  const digitModifiers = normalizePageDigitModifiers(settings.pageDigitModifiers);
  const nextLabel = normalizePageCycleShortcut(settings.pageNextShortcut, DEFAULT_PAGE_NEXT_SHORTCUT);
  const previousLabel = normalizePageCycleShortcut(settings.pagePreviousShortcut, DEFAULT_PAGE_PREVIOUS_SHORTCUT);

  const apply = (field: Recording, value: string) => {
    const tried = field === "digit" ? Array.from({ length: 9 }, (_, index) => `${value}+${index + 1}`) : [value];
    const taken = tried.map((shortcut) => [shortcut, takenBy(shortcut, field)] as const).find(([, owner]) => owner);
    setConflict(taken?.[1] ? t.settings.shortcuts.taken(taken[0], taken[1]) : "");
    if (taken) return;
    if (field === "digit") onSettingsChange({ ...settings, pageDigitModifiers: value });
    else onSettingsChange({ ...settings, ...(field === "next" ? { pageNextShortcut: value } : { pagePreviousShortcut: value }) });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(null);
      return;
    }

    const value = recording === "digit"
      ? digitModifiersFromEvent(event.nativeEvent)
      : recordedPageCycleShortcut(buildShortcutFromEvent(event.nativeEvent) ?? undefined);
    if (!value) return;
    setRecording(null);
    apply(recording, value);
  };

  const rows: [Recording, string, string, string, string][] = [
    ["digit", t.settings.pageShortcuts.digitModifiers, `${digitModifiers}+1–9`, digitModifiers, DEFAULT_PAGE_DIGIT_MODIFIERS],
    ["next", t.settings.pageShortcuts.nextPage, nextLabel, nextLabel, DEFAULT_PAGE_NEXT_SHORTCUT],
    ["previous", t.settings.pageShortcuts.previousPage, previousLabel, previousLabel, DEFAULT_PAGE_PREVIOUS_SHORTCUT],
  ];

  return (
    <section className="settings-section settings-section--page-shortcuts">
      <div className="settings-section__header">
        <span>{t.settings.pageShortcuts.title}</span>
      </div>
      <p className="page-shortcut-hint">{t.settings.pageShortcuts.hint}</p>
      {rows.map(([field, label, display, value, fallback]) => (
        <div className="shortcut-control" key={field}>
          <div className="shortcut-control__meta">
            <span>{label}</span>
            <strong>{display}</strong>
          </div>
          <div className="shortcut-control__actions">
            <ShortcutResetButton
              label={t.settings.shortcuts.reset(field === "digit" ? `${fallback}+1–9` : fallback)}
              isDefault={value === fallback}
              onReset={() => apply(field, fallback)}
            />
            <button
              className={["shortcut-record-button", recording === field ? "shortcut-record-button--recording" : ""].filter(Boolean).join(" ")}
              type="button"
              onClick={() => setRecording(field)}
              onKeyDown={handleKeyDown}
              onBlur={() => setRecording((current) => (current === field ? null : current))}
            >
              <Keyboard size={14} strokeWidth={2.3} />
              <span>{recording === field ? (field === "digit" ? t.settings.pageShortcuts.pressDigit : t.settings.pageShortcuts.pressKeys) : display}</span>
            </button>
          </div>
        </div>
      ))}
      {conflict && <p className="shortcut-control__error" role="alert">{conflict}</p>}
    </section>
  );
}
