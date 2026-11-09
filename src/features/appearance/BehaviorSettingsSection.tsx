import { LOCALE_CODES, TRANSLATIONS, isLocaleCode, useTranslation, type LocaleCode } from "../../i18n";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";

const LOCALE_OPTIONS = LOCALE_CODES.map((code) => ({ value: code, label: TRANSLATIONS[code].localeLabel }));

/** Settings → General → System: start with Windows, the interface language and where settings open. */
export function BehaviorSettingsSection({
  launchAtStartup,
  locale,
  detachedSettings,
  onLaunchAtStartupChange,
  onLocaleChange,
  onDetachedSettingsChange,
}: {
  launchAtStartup: boolean;
  /** Whether settings open in their own window instead of as a page of the island. */
  detachedSettings: boolean;
  onDetachedSettingsChange: (detached: boolean) => void;
  locale: LocaleCode;
  onLaunchAtStartupChange: (enabled: boolean) => void;
  onLocaleChange: (locale: LocaleCode) => void;
}) {
  const t = useTranslation();

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
      <SettingsToggleRow
        title={t.settings.behavior.detachedSettings}
        description={t.settings.behavior.detachedSettingsHint}
        checked={detachedSettings}
        onChange={onDetachedSettingsChange}
      />
    </SettingsGroup>
  );
}
