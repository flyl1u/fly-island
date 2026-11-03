import { useEffect, useRef } from "react";
import { Check, Save } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { SavePathState } from "./types";

export function SavePathSettingsSection({ saveDirectoryDraft, savePathState, highlightSavePath, onSaveDirectoryDraftChange, onSaveDirectory }: {
  saveDirectoryDraft: string;
  savePathState: SavePathState;
  highlightSavePath: boolean;
  onSaveDirectoryDraftChange: (value: string) => void;
  onSaveDirectory: () => void;
}) {
  const t = useTranslation();
  const savePathPanelRef = useRef<HTMLElement | null>(null);
  const savePathInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!highlightSavePath) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const editorPanel = savePathPanelRef.current?.closest(".editor-panel");

      if (editorPanel instanceof HTMLElement && savePathPanelRef.current) {
        editorPanel.scrollTo({
          top: savePathPanelRef.current.offsetTop - 12,
          behavior: "smooth",
        });
      }

      savePathInputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlightSavePath]);

  return (
    <section
      className={[
        "settings-section",
        "settings-section--storage",
        "save-path-panel",
        highlightSavePath ? "save-path-panel--attention" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={savePathPanelRef}
    >
      <div className="settings-section__header save-path-panel__header">
        <span>{t.settings.save.title}</span>
      </div>
      <div className="save-path-row">
        <label className="save-path-field">
          <span>{t.settings.save.folder}</span>
          <input
            ref={savePathInputRef}
            value={saveDirectoryDraft}
            placeholder={t.settings.save.folderPlaceholder}
            aria-label={t.settings.save.folderLabel}
            onChange={(event) =>
              onSaveDirectoryDraftChange(event.currentTarget.value)
            }
          />
        </label>
        <button
          className={[
            "save-path-button",
            savePathState === "saved" ? "save-path-button--saved" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          onClick={onSaveDirectory}
        >
          {savePathState === "saved" ? (
            <>
              <Check className="save-check-icon" size={15} strokeWidth={2.6} />
              <span>{t.settings.save.saved}</span>
            </>
          ) : (
            <>
              <Save size={14} strokeWidth={2.2} />
              <span>{t.settings.save.save}</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
