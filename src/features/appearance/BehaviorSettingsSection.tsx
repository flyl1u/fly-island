import { LOCALE_CODES, TRANSLATIONS, isLocaleCode, useTranslation, type LocaleCode } from "../../i18n";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings, MinimizeAction } from "./types";

const LOCALE_OPTIONS = LOCALE_CODES.map((code) => ({ value: code, label: TRANSLATIONS[code].localeLabel }));

/** Settings → General → System: start with Windows, the interface language and the minimize button. */
export function BehaviorSettingsSection({
  launchAtStartup,
  locale,
  settings,
  onLaunchAtStartupChange,
  onLocaleChange,
  onSettingsChange,
}: {
  launchAtStartup: boolean;
  locale: LocaleCode;
  settings: IslandSettings;
  onLaunchAtStartupChange: (enabled: boolean) => void;
  onLocaleChange: (locale: LocaleCode) => void;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const minimizeActions: { value: MinimizeAction; label: string }[] = [
    { value: "tray", label: t.settings.layout.minimizeToTray },
    { value: "tuck", label: t.settings.layout.minimizeToTop },
  ];

  return (
    <SettingsGroup title={t.settings.behavior.title}>
      <SettingsToggleRow
        title={t.settings.layout.launchAtStartup}
        checked={launchAtStartup}
        onChange={onLaunchAtStartupChange}
      />
      <SettingsRow
        title={t.settings.language.label}
        control={
          <SettingsSelect
            value={locale}
            options={LOCALE_OPTIONS}
            ariaLabel={t.settings.language.label}
            onChange={(next) => {
              if (isLocaleCode(next)) onLocaleChange(next);
            }}
          />
        }
      />
      <SettingsRow
        title={t.settings.layout.minimizeAction}
        description={t.settings.layout.minimizeHint}
        control={
          <SettingsChoice
            value={settings.minimizeAction}
            options={minimizeActions}
            ariaLabel={t.settings.layout.minimizeAction}
            onChange={(minimizeAction) => onSettingsChange({ ...settings, minimizeAction })}
          />
        }
      />
    </SettingsGroup>
  );
}
