import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { colorsFrom, sameColors } from "./colorPalette";
import { addColorPreset, MAX_COLOR_PRESETS, removeColorPreset, type ColorPreset } from "./colorPresets";
import { COLOR_PRESETS_KEY, loadColorPresets, saveColorPresets, withColorBackup } from "./storage";
import type { IslandSettings } from "./types";
import "./ColorPresetRow.css";

export function ColorPresetRow({ settings, onSettingsChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.colors;
  const [presets, setPresets] = useState(loadColorPresets);
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === COLOR_PRESETS_KEY) setPresets(loadColorPresets());
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  const save = (next: ColorPreset[]) => {
    if (saveColorPresets(next)) setPresets(next);
  };
  const add = () => {
    const current = loadColorPresets();
    const next = addColorPreset(current, settings, crypto.randomUUID());
    if (next !== current) save(next);
  };

  return (
    <SettingsRow title={text.presets} control={
      <div className="appearance-presets">
        {presets.map((preset) => {
          const label = text.paletteLabel(preset.islandBackgroundColor, preset.taskTextColor, preset.pulseColor);
          return (
            <div className="appearance-preset" key={preset.id}>
              <button className="appearance-preset__apply" type="button"
                aria-label={`${text.applyPreset}: ${label}`} aria-pressed={sameColors(settings, preset)}
                style={{ background: `conic-gradient(${preset.islandBackgroundColor} 0deg 120deg, ${preset.taskTextColor} 120deg 240deg, ${preset.pulseColor} 240deg 360deg)` }}
                onClick={() => onSettingsChange(withColorBackup(settings, { ...settings, ...colorsFrom(preset) }))}
              />
              <button className="appearance-preset__delete" type="button" aria-label={`${text.deletePreset}: ${label}`}
                onClick={() => save(removeColorPreset(loadColorPresets(), preset.id))}>
                <X size={10} aria-hidden="true" />
              </button>
            </div>
          );
        })}
        <button className="appearance-presets__add" type="button" aria-label={text.savePreset}
          disabled={presets.length >= MAX_COLOR_PRESETS} onClick={add}>
          <Plus size={15} aria-hidden="true" />
        </button>
      </div>
    } />
  );
}
