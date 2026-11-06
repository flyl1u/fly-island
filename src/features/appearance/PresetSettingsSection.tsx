import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import type { IslandPreset } from "./types";
import "./PresetSettingsSection.css";

/**
 * Appearance → Presets, last on the page: one row per saved look (click the name to rename it),
 * "save current" on the title line.
 */
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
  const text = t.settings.presets;
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetNameDraft, setPresetNameDraft] = useState("");

  const commitPresetRename = useCallback(() => {
    if (!editingPresetId) {
      return;
    }
    onRenamePreset(editingPresetId, presetNameDraft);
    setEditingPresetId(null);
    setPresetNameDraft("");
  }, [editingPresetId, onRenamePreset, presetNameDraft]);

  const name = (preset: IslandPreset) =>
    editingPresetId === preset.id ? (
      <input
        className="preset-name-input"
        value={presetNameDraft}
        aria-label={text.nameLabel}
        autoFocus
        onChange={(event) => setPresetNameDraft(event.currentTarget.value)}
        onBlur={commitPresetRename}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitPresetRename();
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
        disabled={preset.isDefault}
        onClick={() => {
          setEditingPresetId(preset.id);
          setPresetNameDraft(preset.name);
        }}
      >
        {preset.name}
      </button>
    );

  return (
    <SettingsGroup title={text.title} action={<SettingsLinkButton onClick={onSavePreset}>{text.saveCurrent}</SettingsLinkButton>}>
      {presets.length === 0 ? (
        <SettingsRow title={<span className="preset-empty">{text.empty}</span>} />
      ) : (
        presets.map((preset) => (
          <SettingsRow
            key={preset.id}
            title={name(preset)}
            control={
              <span className="preset-actions">
                <SettingsLinkButton onClick={() => onApplyPreset(preset.id)}>{text.apply}</SettingsLinkButton>
                {!preset.isDefault && (
                  <button
                    className="preset-delete-button"
                    type="button"
                    aria-label={text.deleteNamed(preset.name)}
                    onClick={() => onDeletePreset(preset.id)}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                )}
              </span>
            }
          />
        ))
      )}
    </SettingsGroup>
  );
}
