import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import type { SavePathState } from "./types";
import "./SavePathSettingsSection.css";

/** Todos → Saving: the folder daily Markdown files go to; Save keeps a typed path. */
export function SavePathSettingsSection({ saveDirectoryDraft, savePathState, highlightSavePath, onSaveDirectoryDraftChange, onSaveDirectory }: {
  saveDirectoryDraft: string;
  savePathState: SavePathState;
  highlightSavePath: boolean;
  onSaveDirectoryDraftChange: (value: string) => void;
  onSaveDirectory: () => void;
}) {
  const t = useTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Opened from the island to set a folder: bring the field into view and focus it.
  useEffect(() => {
    if (!highlightSavePath) return;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightSavePath]);

  const saved = savePathState === "saved";
  return (
    <div ref={panelRef} className={highlightSavePath ? "save-path-panel save-path-panel--attention" : "save-path-panel"}>
      <SettingsGroup title={t.settings.save.title}>
        <SettingsRow
          title={t.settings.save.folder}
          control={
            saved ? (
              <span className="save-path-saved">
                <Check size={14} strokeWidth={2.6} aria-hidden="true" />
                {t.settings.save.saved}
              </span>
            ) : (
              <SettingsLinkButton onClick={onSaveDirectory}>{t.settings.save.save}</SettingsLinkButton>
            )
          }
        >
          <SettingsInput
            ref={inputRef}
            monospace
            value={saveDirectoryDraft}
            placeholder={t.settings.save.folderPlaceholder}
            aria-label={t.settings.save.folderLabel}
            onChange={(event) => onSaveDirectoryDraftChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSaveDirectory();
            }}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
