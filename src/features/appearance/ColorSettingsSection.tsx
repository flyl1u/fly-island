import { SettingsColor } from "../../components/settings/SettingsColor";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { useTranslation } from "../../i18n";
import { DEFAULT_SETTINGS } from "./settings";
import type { IslandSettings } from "./types";

type ColorKey = "islandBackgroundColor" | "taskTextColor" | "pulseColor" | "todoBackgroundColor";

/** Appearance → Colours: one row per colour, then how bright the status light glows. */
export function ColorSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const text = t.settings.colors;
  const colors: readonly [ColorKey, string][] = [
    ["islandBackgroundColor", text.islandBackground],
    ["taskTextColor", text.taskText],
    ["pulseColor", text.pulse],
    ["todoBackgroundColor", text.todoPaper],
  ];

  return (
    <SettingsGroup title={text.title}>
      {colors.map(([key, label]) => (
        <SettingsRow
          key={key}
          title={label}
          control={
            <SettingsColor value={settings[key]} ariaLabel={label} onChange={(value) => onSettingsChange({ ...settings, [key]: value })} />
          }
        />
      ))}
      <SettingsSliderRow
        title={text.pulseBrightness}
        value={settings.pulseBrightness}
        min={50}
        max={160}
        step={1}
        format={(value) => `${Math.round(value)}%`}
        defaultValue={DEFAULT_SETTINGS.pulseBrightness}
        resetLabel={t.settings.layout.resetToDefault}
        onChange={(pulseBrightness) => onSettingsChange({ ...settings, pulseBrightness })}
      />
    </SettingsGroup>
  );
}
