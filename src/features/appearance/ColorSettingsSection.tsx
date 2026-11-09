import { SettingsColor } from "../../components/settings/SettingsColor";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import type { IslandSettings } from "./types";

type ColorKey = "islandBackgroundColor" | "taskTextColor" | "pulseColor";

/** Appearance → Colours: the island, its text and its status light. */
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
    </SettingsGroup>
  );
}
