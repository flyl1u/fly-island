import { useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import {
  addAppearancePreset,
  applyAppearancePreset,
  APPEARANCE_PRESET_NAME_LIMIT,
  loadAppearancePresets,
  MAX_APPEARANCE_PRESETS,
  removeAppearancePreset,
  saveAppearancePresets,
  type AppearancePreset,
} from "./appearancePresets";
import type { IslandSettings } from "./types";

/**
 * Appearance → whole-look presets: save everything the appearance page sets under a name, apply it
 * later, and keep adjusting from there. The list is read once and written on every change.
 */
export function AppearancePresetSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.appearancePresets;
  const [presets, setPresets] = useState<AppearancePreset[]>(loadAppearancePresets);
  const [name, setName] = useState("");
  const full = presets.length >= MAX_APPEARANCE_PRESETS;

  const save = () => {
    const next = addAppearancePreset(presets, name, settings, crypto.randomUUID());
    if (next === presets) return;
    if (saveAppearancePresets(next)) {
      setPresets(next);
      setName("");
    }
  };

  const remove = (id: string) => {
    const next = removeAppearancePreset(presets, id);
    if (saveAppearancePresets(next)) setPresets(next);
  };

  return (
    <SettingsGroup
      title={text.title}
      footer={<p>{full ? text.full(MAX_APPEARANCE_PRESETS) : text.hint}</p>}
    >
      {presets.length === 0 && <p className="appearance-preset__empty">{text.empty}</p>}
      {presets.map((preset) => (
        <SettingsRow
          key={preset.id}
          title={preset.name}
          control={
            <>
              <SettingsLinkButton onClick={() => onSettingsChange(applyAppearancePreset(settings, preset))}>
                {text.apply}
              </SettingsLinkButton>
              <SettingsLinkButton onClick={() => remove(preset.id)}>{text.delete}</SettingsLinkButton>
            </>
          }
        />
      ))}
      <SettingsRow
        title={text.nameLabel}
        control={
          <SettingsInput
            value={name}
            maxLength={APPEARANCE_PRESET_NAME_LIMIT}
            placeholder={text.namePlaceholder}
            aria-label={text.nameLabel}
            disabled={full}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
            }}
          />
        }
      />
      <SettingsRow
        title={text.save}
        control={<SettingsLinkButton disabled={full || !name.trim()} onClick={save}>{text.save}</SettingsLinkButton>}
      />
    </SettingsGroup>
  );
}
