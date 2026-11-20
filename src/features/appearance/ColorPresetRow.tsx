import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { sameColors } from "./colorPalette";
import { addColorPreset, applyColorPreset, MAX_COLOR_PRESETS, removeColorPreset, type ColorPreset } from "./colorPresets";
import { COLOR_PRESETS_KEY, loadColorPresets, saveColorPresets, withColorBackup } from "./storage";
import { resolveSchemeColors, type ResolvedScheme } from "./theme";
import type { IslandSettings } from "./types";
import { useResolvedScheme } from "./useDocumentTheme";
import "./ColorPresetRow.css";

const DELETE_CONFIRM_MS = 3_000;

/**
 * Equal slices in the order of the rows above. Follow-background page text shows the ink the
 * scheme would draw on this preset's background; presets saved before page text was kept have three.
 */
function swatch(preset: ColorPreset, scheme: ResolvedScheme) {
  const pageInk = preset.pageTextColor === undefined ? undefined
    : preset.pageTextColor || (resolveSchemeColors(preset, scheme).tone === "light" ? "#1A1A20" : "#F8F6F0");
  const colors = [preset.islandBackgroundColor, preset.taskTextColor, preset.pulseColor, pageInk]
    .filter((color): color is string => Boolean(color));
  const slice = 360 / colors.length;
  return `conic-gradient(${colors.map((color, index) => `${color} ${index * slice}deg ${(index + 1) * slice}deg`).join(", ")})`;
}

export function ColorPresetRow({ settings, onSettingsChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.colors;
  const scheme = useResolvedScheme(settings.colorScheme);
  const [presets, setPresets] = useState(loadColorPresets);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmingId) return;
    const timer = window.setTimeout(() => setConfirmingId(null), DELETE_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirmingId]);
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
          const label = text.paletteLabel(preset.islandBackgroundColor, preset.taskTextColor, preset.pulseColor, preset.pageTextColor);
          const confirming = confirmingId === preset.id;
          return (
            <div className={`appearance-preset${confirming ? " appearance-preset--confirming" : ""}`} key={preset.id}
              onMouseLeave={() => { if (confirming) setConfirmingId(null); }}>
              <button className="appearance-preset__apply" type="button"
                aria-label={`${text.applyPreset}: ${label}`} aria-disabled={confirming}
                aria-pressed={sameColors(settings, preset) && (preset.pageTextColor === undefined || preset.pageTextColor === settings.pageTextColor.toUpperCase())}
                style={{ background: swatch(preset, scheme) }}
                onClick={() => { if (!confirming) onSettingsChange(withColorBackup(settings, applyColorPreset(settings, preset))); }}
              />
              <button className="appearance-preset__delete" type="button" aria-label={`${confirming ? text.confirmDeletePreset : text.deletePreset}: ${label}`}
                onClick={() => {
                  if (confirming) { save(removeColorPreset(loadColorPresets(), preset.id)); setConfirmingId(null); }
                  else setConfirmingId(preset.id);
                }}>
                {confirming ? <Check size={10} aria-hidden="true" /> : <X size={10} aria-hidden="true" />}
              </button>
            </div>
          );
        })}
        <button className="appearance-presets__add" type="button" aria-label={text.savePreset}
          disabled={presets.length >= MAX_COLOR_PRESETS} onClick={add}>
          <Plus size={15} aria-hidden="true" />
        </button>
        {confirmingId && <span className="appearance-presets__confirmation" role="status">{text.confirmDeletePreset}</span>}
      </div>
    } />
  );
}
