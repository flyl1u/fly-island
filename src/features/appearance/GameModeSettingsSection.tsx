import { useTranslation } from "../../i18n";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "./types";

/** Game mode: what the island holds back while a full-screen app is in front. */
export function GameModeSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const text = t.settings.gameMode;

  return (
    <SettingsGroup title={text.title} footer={text.hint}>
      <SettingsToggleRow
        title={text.doNotDisturb}
        description={text.doNotDisturbHint}
        checked={settings.gameDoNotDisturb}
        onChange={(gameDoNotDisturb) => onSettingsChange({ ...settings, gameDoNotDisturb })}
      />
      <SettingsToggleRow
        title={text.autoTuck}
        description={text.autoTuckHint}
        checked={settings.gameAutoTuck}
        onChange={(gameAutoTuck) => onSettingsChange({ ...settings, gameAutoTuck })}
      />
    </SettingsGroup>
  );
}
