import type { IslandSettings } from "../../features/appearance/types";
import { MusicSourceSettingsSection } from "../../features/media/MusicSourceSettingsSection";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

export function MusicSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.music}
        checked={settings.musicEnabled}
        onChange={(musicEnabled) => onSettingsChange({ ...settings, musicEnabled })}
      />
      {settings.musicEnabled && <MusicSourceSettingsSection />}
    </>
  );
}
