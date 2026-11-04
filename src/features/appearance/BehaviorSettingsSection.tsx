import { useTranslation } from "../../i18n";
import { ToggleControl } from "../../components/controls/ToggleControl";

export function BehaviorSettingsSection({
  launchAtStartup,
  onLaunchAtStartupChange,
}: {
  launchAtStartup: boolean;
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
    </section>
  );
}
