import { useTranslation } from "../../i18n";
import { NumberControl } from "../../components/controls/NumberControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import type { IslandSettings } from "./types";

export function BehaviorSettingsSection({
  settings,
  launchAtStartup,
  onSettingsChange,
  onLaunchAtStartupChange,
}: {
  settings: IslandSettings;
  launchAtStartup: boolean;
  onSettingsChange: (settings: IslandSettings) => void;
  onLaunchAtStartupChange: (enabled: boolean) => void;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--behavior">
      <div className="settings-section__header">
        <span>{t.settings.behavior.title}</span>
      </div>
      <ToggleControl
        label={t.settings.layout.launchAtStartup}
        checked={launchAtStartup}
        onChange={onLaunchAtStartupChange}
      />
      <ToggleControl
        label={t.settings.layout.autoTuck}
        checked={settings.autoTuck}
        onChange={(autoTuck) => onSettingsChange({ ...settings, autoTuck })}
      />
      {settings.autoTuck && (
        <NumberControl
          label={t.settings.layout.autoTuckSeconds}
          value={settings.autoTuckSeconds}
          min={1}
          max={3_600}
          onChange={(autoTuckSeconds) => onSettingsChange({ ...settings, autoTuckSeconds })}
        />
      )}
    </section>
  );
}
