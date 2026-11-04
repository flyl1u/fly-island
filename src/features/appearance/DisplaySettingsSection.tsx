import { useTranslation } from "../../i18n";
import { ToggleControl } from "../../components/controls/ToggleControl";
import type { IslandSettings } from "./types";

export function DisplaySettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--display">
      <div className="settings-section__header">
        <span>{t.settings.layout.displayTitle}</span>
      </div>
      <ToggleControl
        label={t.settings.layout.showCollapsedText}
        checked={settings.showCollapsedText}
        onChange={(showCollapsedText) =>
          onSettingsChange({ ...settings, showCollapsedText })
        }
      />
      <ToggleControl
        label={t.settings.layout.showTitle}
        checked={settings.showTitle}
        onChange={(showTitle) => onSettingsChange({ ...settings, showTitle })}
      />
    </section>
  );
}
