import { useCallback, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { IslandPreset } from "./types";
import "./PresetSettingsSection.css";

export function PresetSettingsSection({
  presets,
  onSavePreset,
  onApplyPreset,
  onRenamePreset,
  onDeletePreset,
}: {
  presets: IslandPreset[];
  onSavePreset: () => void;
  onApplyPreset: (presetId: string) => void;
  onRenamePreset: (presetId: string, name: string) => void;
  onDeletePreset: (presetId: string) => void;
}) {
  const t = useTranslation();
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetNameDraft, setPresetNameDraft] = useState("");

  const startPresetRename = useCallback((preset: IslandPreset) => {
    setEditingPresetId(preset.id);
    setPresetNameDraft(preset.name);
  }, []);

  const commitPresetRename = useCallback(() => {
    if (!editingPresetId) {
      return;
    }

    onRenamePreset(editingPresetId, presetNameDraft);
    setEditingPresetId(null);
    setPresetNameDraft("");
  }, [editingPresetId, onRenamePreset, presetNameDraft]);

  return (
    <section className="settings-section settings-section--presets">
      <div className="settings-section__header">
        <span>{t.settings.presets.title}</span>
        <button
          className="preset-save-button"
          type="button"
          onClick={onSavePreset}
        >
          <Save size={13} strokeWidth={2.2} />
          <span>{t.settings.presets.saveCurrent}</span>
        </button>
      </div>
      {presets.length === 0 ? (
        <div className="preset-empty">{t.settings.presets.empty}</div>
      ) : (
        <div className="preset-list" role="list">
          {presets.map((preset) => (
            <div
              className={[
                "preset-item",
                preset.isDefault ? "preset-item--default" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={preset.id}
              role="listitem"
            >
              {editingPresetId === preset.id ? (
                <input
                  className="preset-name-input"
                  value={presetNameDraft}
                  aria-label={t.settings.presets.nameLabel}
                  autoFocus
                  onChange={(event) =>
                    setPresetNameDraft(event.currentTarget.value)
                  }
                  onBlur={commitPresetRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitPresetRename();
                    }

                    if (event.key === "Escape") {
                      setEditingPresetId(null);
                      setPresetNameDraft("");
                    }
                  }}
                />
              ) : (
                <button
                  className="preset-name-button"
                  type="button"
                  title={
                    preset.isDefault
                      ? t.settings.presets.defaultPreset
                      : t.settings.presets.rename
                  }
                  disabled={preset.isDefault}
                  onClick={() => {
                    if (!preset.isDefault) {
                      startPresetRename(preset);
                    }
                  }}
                >
                  {preset.name}
                </button>
              )}
              <button
                className="preset-apply-button"
                type="button"
                onClick={() => onApplyPreset(preset.id)}
              >
                {t.settings.presets.apply}
              </button>
              {preset.isDefault ? (
                <span className="preset-delete-spacer" aria-hidden="true" />
              ) : (
                <button
                  className="preset-delete-button"
                  type="button"
                  title={t.settings.presets.delete}
                  aria-label={t.settings.presets.deleteNamed(preset.name)}
                  onClick={() => onDeletePreset(preset.id)}
                >
                  <Trash2 size={13} strokeWidth={2.2} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
