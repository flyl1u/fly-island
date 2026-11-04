import { ColorSettingsSection } from "../../features/appearance/ColorSettingsSection";
import { LayoutSettingsSection } from "../../features/appearance/LayoutSettingsSection";
import { PresetSettingsSection } from "../../features/appearance/PresetSettingsSection";
import type { IslandSettings } from "../../features/appearance/types";
import type { useSettingPresets } from "../../features/appearance/useSettingPresets";

export function AppearanceSettingsPage({
  settings,
  presets,
  onSettingsChange,
}: {
  settings: IslandSettings;
  presets: ReturnType<typeof useSettingPresets>;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  return (
    <>
      <LayoutSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
      <ColorSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
      <PresetSettingsSection
        presets={presets.presets}
        onSavePreset={presets.onSavePreset}
        onApplyPreset={presets.onApplyPreset}
        onRenamePreset={presets.onRenamePreset}
        onDeletePreset={presets.onDeletePreset}
      />
    </>
  );
}
