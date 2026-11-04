import { useTranslation, type LocaleCode } from "../../i18n";
import { LocaleControl } from "../../i18n/LocaleControl";
import { BehaviorSettingsSection } from "../../features/appearance/BehaviorSettingsSection";
import { ExpandSettingsSection } from "../../features/appearance/ExpandSettingsSection";
import type { IslandSettings } from "../../features/appearance/types";
import { useLaunchAtStartup } from "./useLaunchAtStartup";

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
  const t = useTranslation();
  const [launchAtStartup, updateLaunchAtStartup] = useLaunchAtStartup();

  return (
    <>
      <section className="settings-section settings-section--language">
        <div className="settings-section__header">
          <span>{t.settings.language.title}</span>
        </div>
        <LocaleControl
          label={t.settings.language.label}
          value={locale}
          onChange={onLocaleChange}
        />
      </section>
      <BehaviorSettingsSection
        launchAtStartup={launchAtStartup}
        onLaunchAtStartupChange={updateLaunchAtStartup}
      />
      <ExpandSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
    </>
  );
}
