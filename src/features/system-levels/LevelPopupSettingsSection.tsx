import { useTranslation } from "../../i18n";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "../appearance/types";

/** Settings → General: the volume and brightness popup on the collapsed island. */
export function LevelPopupSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.levelPopup;

  return (
    <SettingsGroup title={text.title}>
      <SettingsToggleRow
        title={text.popup}
        description={text.popupHint}
        checked={settings.levelPopup}
        onChange={(levelPopup) => onSettingsChange({ ...settings, levelPopup })}
      />
    </SettingsGroup>
  );
}
