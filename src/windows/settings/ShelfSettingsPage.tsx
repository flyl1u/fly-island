import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

export function ShelfSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <ModuleSwitchSection
      label={t.settings.modules.shelf}
      checked={settings.shelfEnabled}
      onChange={(shelfEnabled) => onSettingsChange({ ...settings, shelfEnabled })}
    />
  );
}
