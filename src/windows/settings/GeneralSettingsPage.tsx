import type { LocaleCode } from "../../i18n";
import { BehaviorSettingsSection } from "../../features/appearance/BehaviorSettingsSection";
import { ExpandSettingsSection } from "../../features/appearance/ExpandSettingsSection";
import { GameModeSettingsSection } from "../../features/appearance/GameModeSettingsSection";
import { PositionSettingsSection } from "../../features/appearance/PositionSettingsSection";
import type { IslandSettings } from "../../features/appearance/types";
import { requestIslandPositionReset } from "./storage";
import { useLaunchAtStartup } from "./useLaunchAtStartup";

/** Settings → General: system, opening, tucking to the edge, sliding back out, games and position. */
export function GeneralSettingsPage({
  locale,
  settings,
  detachedSettings,
  onLocaleChange,
  onSettingsChange,
  onDetachedSettingsChange,
}: {
  locale: LocaleCode;
  settings: IslandSettings;
  detachedSettings: boolean;
  onLocaleChange: (locale: LocaleCode) => void;
  onSettingsChange: (settings: IslandSettings) => void;
  onDetachedSettingsChange: (detached: boolean) => void;
}) {
  const [launchAtStartup, updateLaunchAtStartup] = useLaunchAtStartup();

  return (
    <>
      <BehaviorSettingsSection
        launchAtStartup={launchAtStartup}
        locale={locale}
        settings={settings}
        detachedSettings={detachedSettings}
        onDetachedSettingsChange={onDetachedSettingsChange}
        onLaunchAtStartupChange={updateLaunchAtStartup}
        onLocaleChange={onLocaleChange}
        onSettingsChange={onSettingsChange}
      />
      <ExpandSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
      <GameModeSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
      <PositionSettingsSection
        settings={settings}
        onSettingsChange={onSettingsChange}
        onResetPosition={requestIslandPositionReset}
      />
    </>
  );
}
