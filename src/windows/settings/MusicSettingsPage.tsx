import type { IslandSettings } from "../../features/appearance/types";
import { LyricsSettingsSection } from "../../features/media/lyrics/LyricsSettingsSection";
import { MusicSourcePrioritySection } from "../../features/media/MusicSourcePrioritySection";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

/** Settings → Music: the module switch, which player the island follows, and where lyrics come from. */
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
      {settings.musicEnabled && <MusicSourcePrioritySection />}
      {settings.musicEnabled && <LyricsSettingsSection settings={settings} onSettingsChange={onSettingsChange} />}
    </>
  );
}
