import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Keyboard } from "lucide-react";
import { useTranslation } from "../../i18n";
import { buildShortcutFromEvent } from "../clipboard/shortcut.ts";
import "../clipboard/ClipboardSettingsSection.css";
import {
  digitModifiersFromEvent,
  normalizePageCycleShortcut,
  normalizePageDigitModifiers,
  recordedPageCycleShortcut,
  DEFAULT_PAGE_NEXT_SHORTCUT,
  DEFAULT_PAGE_PREVIOUS_SHORTCUT,
} from "./pageShortcuts.ts";
import type { IslandSettings } from "./types";
import "./PageShortcutSection.css";

type Recording = "digit" | "next" | "previous";

/** General-page shortcuts for moving between expanded island pages. */
export function PageShortcutSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const [recording, setRecording] = useState<Recording | null>(null);
  const digitLabel = `${normalizePageDigitModifiers(settings.pageDigitModifiers)}+1–9`;
  const nextLabel = normalizePageCycleShortcut(settings.pageNextShortcut, DEFAULT_PAGE_NEXT_SHORTCUT);
  const previousLabel = normalizePageCycleShortcut(settings.pagePreviousShortcut, DEFAULT_PAGE_PREVIOUS_SHORTCUT);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(null);
      return;
    }

    if (recording === "digit") {
      const modifiers = digitModifiersFromEvent(event.nativeEvent);
      if (!modifiers) return;
      onSettingsChange({ ...settings, pageDigitModifiers: modifiers });
      setRecording(null);
      return;
    }

    const shortcut = recordedPageCycleShortcut(buildShortcutFromEvent(event.nativeEvent) ?? undefined);
    if (!shortcut) return;
    onSettingsChange({
      ...settings,
      ...(recording === "next" ? { pageNextShortcut: shortcut } : { pagePreviousShortcut: shortcut }),
    });
    setRecording(null);
  };

  const rows: [Recording, string, string][] = [
    ["digit", t.settings.pageShortcuts.digitModifiers, digitLabel],
    ["next", t.settings.pageShortcuts.nextPage, nextLabel],
    ["previous", t.settings.pageShortcuts.previousPage, previousLabel],
  ];

  return (
    <section className="settings-section settings-section--page-shortcuts">
      <div className="settings-section__header">
        <span>{t.settings.pageShortcuts.title}</span>
      </div>
      <p className="page-shortcut-hint">{t.settings.pageShortcuts.hint}</p>
      {rows.map(([field, label, value]) => (
        <div className="shortcut-control" key={field}>
          <div className="shortcut-control__meta">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
          <button
            className={["shortcut-record-button", recording === field ? "shortcut-record-button--recording" : ""].filter(Boolean).join(" ")}
            type="button"
            onClick={() => setRecording(field)}
            onKeyDown={handleKeyDown}
            onBlur={() => setRecording((current) => (current === field ? null : current))}
          >
            <Keyboard size={14} strokeWidth={2.3} />
            <span>{recording === field ? (field === "digit" ? t.settings.pageShortcuts.pressDigit : t.settings.pageShortcuts.pressKeys) : value}</span>
          </button>
        </div>
      ))}
    </section>
  );
}
