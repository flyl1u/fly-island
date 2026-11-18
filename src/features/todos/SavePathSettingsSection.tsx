import { useEffect, useRef, useState } from "react";
import { Check, FolderOpen } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { pickFolder } from "./api";
import type { SavePathState } from "./types";
import "./SavePathSettingsSection.css";

/**
 * Todos → Saving: the folder daily Markdown files go to. Save keeps a typed path; a folder
 * chosen with the folder button is saved at once.
 */
export function SavePathSettingsSection({ saveDirectoryDraft, savePathState, highlightSavePath, onSaveDirectoryDraftChange, onSaveDirectory, onPickDirectory }: {
  saveDirectoryDraft: string;
  savePathState: SavePathState;
  highlightSavePath: boolean;
  onSaveDirectoryDraftChange: (value: string) => void;
  onSaveDirectory: () => void;
  onPickDirectory: (directory: string) => void;
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

  const [picking, setPicking] = useState(false);
  const [pickFailed, setPickFailed] = useState(false);

  const browse = async () => {
    if (picking) return;
    setPicking(true);
    setPickFailed(false);
    try {
      const directory = await pickFolder(saveDirectoryDraft, t.settings.save.browseTitle);
      if (directory) onPickDirectory(directory);
    } catch {
      setPickFailed(true);
    } finally {
      setPicking(false);
    }
  };

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
          <div className="save-path-field">
            <SettingsInput
              ref={inputRef}
              monospace
              value={saveDirectoryDraft}
              placeholder={t.settings.save.folderPlaceholder}
              aria-label={t.settings.save.folderLabel}
              onChange={(event) => {
                setPickFailed(false);
                onSaveDirectoryDraftChange(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSaveDirectory();
              }}
            />
            <button
              type="button"
              className="save-path-browse"
              title={t.settings.save.browse}
              aria-label={t.settings.save.browse}
              disabled={picking}
              onClick={() => void browse()}
            >
              <FolderOpen size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
          {pickFailed && <p className="save-path-error" role="alert">{t.settings.save.browseFailed}</p>}
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
