import type { LocaleCode } from "../../i18n";
import { BehaviorSettingsSection } from "../../features/appearance/BehaviorSettingsSection";
import { ExpandSettingsSection } from "../../features/appearance/ExpandSettingsSection";
import { GameModeSettingsSection } from "../../features/appearance/GameModeSettingsSection";
import { DeviceUseSettingsSection } from "../../features/device-use/DeviceUseSettingsSection";
import { LevelPopupSettingsSection } from "../../features/system-levels/LevelPopupSettingsSection";
import { DeviceAlertSettingsSection } from "../../features/device-events/DeviceAlertSettingsSection";
import { PositionSettingsSection } from "../../features/appearance/PositionSettingsSection";
import { SettingsBackupSection } from "../../features/settings-backup/SettingsBackupSection";
import type { IslandSettings } from "../../features/appearance/types";
import { requestIslandPositionReset } from "./storage";
import { useLaunchAtStartup } from "./useLaunchAtStartup";

/** Settings → General: system, opening, tucking to the edge, sliding back out, games, volume and brightness popup, privacy indicator, position and backup. */
export function GeneralSettingsPage({
  locale,
  settings,
  onLocaleChange,
  onSettingsChange,
}: {
  locale: LocaleCode;
  settings: IslandSettings;
  onLocaleChange: (locale: LocaleCode) => void;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const [launchAtStartup, updateLaunchAtStartup] = useLaunchAtStartup();

  return (
    <>
      <BehaviorSettingsSection
        launchAtStartup={launchAtStartup}
        locale={locale}
        settings={settings}
        onLaunchAtStartupChange={updateLaunchAtStartup}
        onLocaleChange={onLocaleChange}
        onSettingsChange={onSettingsChange}
      />
      <ExpandSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
      <GameModeSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
      <LevelPopupSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
      <DeviceAlertSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
      <DeviceUseSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
      <PositionSettingsSection
        settings={settings}
        onSettingsChange={onSettingsChange}
        onResetPosition={requestIslandPositionReset}
      />
      <SettingsBackupSection />
    </>
  );
}
