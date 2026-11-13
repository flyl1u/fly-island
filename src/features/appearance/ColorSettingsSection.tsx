import { SettingsColor } from "../../components/settings/SettingsColor";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import type { IslandSettings } from "./types";
import { HexColorInput } from "./HexColorInput";
import { Undo2 } from "lucide-react";
import { loadColorBackup, swapColorBackup } from "./storage";
import "./ColorSettingsSection.css";

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
  const backup = loadColorBackup();
  const colors: readonly [ColorKey, string][] = [
    ["islandBackgroundColor", text.islandBackground],
    ["taskTextColor", text.taskText],
    ["pulseColor", text.pulse],
  ];

  return (
    <SettingsGroup title={text.title} action={backup && (
      <button className="appearance-color-restore" type="button" aria-label={text.restore}
        onClick={() => onSettingsChange(swapColorBackup(settings))}>
        <Undo2 size={15} aria-hidden="true" />
      </button>
    )}>
      {colors.map(([key, label]) => (
        <SettingsRow
          key={key}
          title={label}
          control={
            <SettingsColor
              value={settings[key]}
              ariaLabel={label}
              onChange={(value) => onSettingsChange({ ...settings, [key]: value.toUpperCase() })}
              valueControl={<HexColorInput value={settings[key]} ariaLabel={label} onChange={(value) => onSettingsChange({ ...settings, [key]: value })} />}
            />
          }
        />
      ))}
    </SettingsGroup>
  );
}
