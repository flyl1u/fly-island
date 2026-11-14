import type { LocaleCode } from "../../i18n";
import { BehaviorSettingsSection } from "../../features/appearance/BehaviorSettingsSection";
import { ExpandSettingsSection } from "../../features/appearance/ExpandSettingsSection";
import { KeepVisibleSettingsSection } from "../../features/appearance/KeepVisibleSettingsSection";
import type { IslandSettings } from "../../features/appearance/types";
import { requestIslandPositionReset, requestPanelPreview } from "./storage";
import { useLaunchAtStartup } from "./useLaunchAtStartup";

/** Settings → General: system (startup, language, settings window), then the island's opening and tucking. */
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
        detachedSettings={detachedSettings}
        onDetachedSettingsChange={onDetachedSettingsChange}
        onLaunchAtStartupChange={updateLaunchAtStartup}
        onLocaleChange={onLocaleChange}
      />
      <ExpandSettingsSection settings={settings} onSettingsChange={onSettingsChange} onResetPosition={requestIslandPositionReset}
        onPreviewTuck={() => requestPanelPreview("tucked")} />
      <KeepVisibleSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
    </>
  );
}
