import { useTranslation } from "../../i18n";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { BROWSER_AUTO_TUCK_DELAY_SECONDS } from "./settingsLimits";
import type { IslandSettings } from "./types";

/**
 * Tuck while a browser is in front (PR #118): how long the cursor must rest on the tucked island
 * before it opens, or a click instead. Greyed out while "never tuck automatically" is on.
 */
export function BrowserTuckRows({ settings, onSettingsChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const expand = t.settings.expand;
  const update = (patch: Partial<IslandSettings>) => onSettingsChange({ ...settings, ...patch });
  const off = settings.neverAutoTuck;
  return (
    <>
      <SettingsToggleRow
        title={t.settings.layout.browserAutoTuck}
        description={off ? t.settings.layout.neverAutoTuckOverrides : t.settings.layout.browserAutoTuckHint}
        checked={settings.browserAutoTuck}
        disabled={off}
        onChange={(browserAutoTuck) => update({ browserAutoTuck })}
      />
      {settings.browserAutoTuck ? (
        <>
          <SettingsSliderRow
            title={t.settings.layout.browserAutoTuckDelay}
            description={t.settings.layout.browserAutoTuckDelayHint}
            value={settings.browserAutoTuckDelaySeconds}
            min={BROWSER_AUTO_TUCK_DELAY_SECONDS.min}
            max={BROWSER_AUTO_TUCK_DELAY_SECONDS.max}
            step={BROWSER_AUTO_TUCK_DELAY_SECONDS.step}
            format={(value) => value + " " + expand.secondsUnit}
            editable
            unit={expand.secondsUnit}
            disabled={off || settings.browserAutoTuckClickToOpen}
            defaultValue={BROWSER_AUTO_TUCK_DELAY_SECONDS.default}
            resetLabel={t.settings.layout.resetToDefault}
            indent
            onChange={(browserAutoTuckDelaySeconds) => update({ browserAutoTuckDelaySeconds })}
          />
          <SettingsToggleRow
            title={t.settings.layout.browserAutoTuckClickToOpen}
            description={t.settings.layout.browserAutoTuckClickToOpenHint}
            checked={settings.browserAutoTuckClickToOpen}
            indent
            disabled={off}
            onChange={(browserAutoTuckClickToOpen) => update({ browserAutoTuckClickToOpen })}
          />
        </>
      ) : null}
    </>
  );
}
